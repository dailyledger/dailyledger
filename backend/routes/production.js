const express = require('express');
const router = express.Router();
const Production = require('../models/Production');
const Item = require('../models/Item');
const buildQuery = require('../utils/dateFilter');
const { BadRequestError } = require('../utils/dateFilter');
const {
  round2,
  round3,
  round4,
  isPositiveNumber,
  isSaneAmount,
  isSaneQuantity,
  MAX_QUANTITY,
  MAX_ITEM_NAME,
} = require('../utils/money');
const { findShortfalls, moveStock, assertStockedBy } = require('../utils/stock');
const { runInTransaction } = require('../utils/tx');
const {
  writeContext,
  findByIdempotencyKey,
  idempotencyKeyFrom,
  sendError,
  describeShortfalls,
} = require('../utils/ledger');

/*
 * Cooking batches. Purchases bring raw materials into stock; a batch uses some of
 * them (only the quantity actually used is costed) and creates the dish, which the
 * sale screen then sells like any other item. Nothing here touches the sale,
 * purchase or spoilage flows: it only moves stock and sets the dish's cost.
 */

const MAX_INGREDIENTS = 30;

/** Validate the request and price the batch from the catalog, never from the client. */
async function resolveBatch(shop, body) {
  if (!body || typeof body.dish_name !== 'string' || !body.dish_name.trim()) {
    throw new BadRequestError('Dish name is required');
  }
  const dishName = body.dish_name.trim();
  if (dishName.length > MAX_ITEM_NAME) {
    throw new BadRequestError(`Dish name must be ${MAX_ITEM_NAME} characters or fewer`);
  }
  if (!['kg', 'litre', 'piece'].includes(body.unit_type)) {
    throw new BadRequestError('Unit must be kg, litre or piece');
  }
  if (!isSaneQuantity(body.quantity)) {
    throw new BadRequestError(`Quantity made must be more than 0 and at most ${MAX_QUANTITY}`);
  }
  if (!isPositiveNumber(body.selling_price) || !isSaneAmount(body.selling_price)) {
    throw new BadRequestError('Selling price must be greater than 0');
  }
  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    throw new BadRequestError('Add at least one ingredient');
  }
  if (body.ingredients.length > MAX_INGREDIENTS) {
    throw new BadRequestError(`A batch can have at most ${MAX_INGREDIENTS} ingredients`);
  }

  const dish = await Item.findByName(shop, dishName);
  if (dish) {
    if ((dish.kind || 'resale') !== 'cooked') {
      throw new BadRequestError(
        `"${dish.item_name}" is already a ${dish.kind === 'raw' ? 'raw material' : 'purchased item'}. ` +
          'Choose a different dish name.'
      );
    }
    if (dish.unit_type !== body.unit_type) {
      throw new BadRequestError(
        `"${dish.item_name}" is counted in ${dish.unit_type}, not ${body.unit_type}`
      );
    }
  }

  const seen = new Set();
  const ingredients = [];
  for (const raw of body.ingredients) {
    if (!raw || typeof raw.item_name !== 'string' || !raw.item_name.trim()) {
      throw new BadRequestError('Every ingredient needs an item');
    }
    if (!isSaneQuantity(raw.quantity)) {
      throw new BadRequestError(
        `Quantity used for "${raw.item_name}" must be more than 0 and at most ${MAX_QUANTITY}`
      );
    }

    const item = await Item.findByName(shop, raw.item_name);
    if (!item) {
      throw new BadRequestError(`"${raw.item_name}" must be purchased first before it can be used`);
    }
    if (item._id.equals(dish?._id) || item.item_name.toLowerCase() === dishName.toLowerCase()) {
      throw new BadRequestError('A dish cannot be an ingredient of itself');
    }
    const key = item.item_name.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestError(`"${item.item_name}" is listed twice. Combine it into one line.`);
    }
    seen.add(key);

    const quantity = round3(raw.quantity);
    const costPerUnit = round4(item.last_cost_price);
    ingredients.push({
      item_name: item.item_name,
      unit_type: item.unit_type,
      quantity,
      cost_per_unit: costPerUnit,
      // Only what is used is costed: 4 of 5 lemons at ₹5 adds ₹20, and the fifth
      // lemon stays in stock at its own cost.
      line_cost: round2(quantity * costPerUnit),
    });
  }

  const quantity = round3(body.quantity);
  const totalCost = round2(ingredients.reduce((sum, i) => sum + i.line_cost, 0));

  return {
    dish_name: dish ? dish.item_name : dishName,
    unit_type: body.unit_type,
    quantity,
    ingredients,
    total_cost: totalCost,
    cost_per_unit: round4(totalCost / quantity),
    selling_price: round2(body.selling_price),
    dishItem: dish,
  };
}

router.post('/', async (req, res) => {
  try {
    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(Production, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const ctx = writeContext(req, req.body.date);
    const { dishItem, ...batch } = await resolveBatch(req.shopId, req.body);
    // An ingredient cannot be used on a date before it was ever bought.
    for (const ing of batch.ingredients) {
      await assertStockedBy(req.shopId, ing.item_name, ctx.date_key);
    }

    const allowNegative = req.body.allow_negative === true;
    const shortfalls = await findShortfalls(
      req.shopId,
      batch.ingredients.map((i) => ({ item_name: i.item_name, quantity: i.quantity }))
    );
    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const production = await runInTransaction(async (session) => {
      const created = new Production({
        shop: ctx.shop,
        ...batch,
        date: ctx.date,
        date_key: ctx.date_key,
        notes: req.body.notes,
        stock_warning: shortfalls.length ? describeShortfalls(shortfalls) : null,
        idempotency_key: idempotencyKey,
      });
      await created.save({ session });

      for (const ing of batch.ingredients) {
        await moveStock({
          shop: ctx.shop,
          item_name: ing.item_name,
          delta: -ing.quantity,
          reason: 'cook_use',
          ref_model: 'Production',
          ref_id: created._id,
          cost_per_unit: ing.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: `used in ${batch.dish_name}`,
          allowNegative,
          session,
        });
      }

      // The dish enters the catalog here, the same way a bought item enters it
      // through a purchase.
      if (!dishItem) {
        await Item.create(
          [
            {
              shop: ctx.shop,
              item_name: batch.dish_name,
              unit_type: batch.unit_type,
              kind: 'cooked',
              stock_quantity: 0,
              inventory_value: 0,
              last_cost_price: batch.cost_per_unit,
              last_selling_price: batch.selling_price,
            },
          ],
          session ? { session } : undefined
        );
      } else {
        // A later batch can cost differently. moveStock blends it with what is still
        // on the shelf, so only the selling price is set here.
        await Item.updateOne(
          { _id: dishItem._id },
          { $set: { last_selling_price: batch.selling_price } },
          session ? { session } : undefined
        );
      }

      await moveStock({
        shop: ctx.shop,
        item_name: batch.dish_name,
        delta: batch.quantity,
        reason: 'cook_make',
        ref_model: 'Production',
        ref_id: created._id,
        cost_per_unit: batch.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        session,
      });

      return created;
    });

    res.status(201).json(production);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const batches = await Production.find(buildQuery(req)).sort({ date: -1 });
    res.json(batches);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const batch = await Production.findOne({ _id: req.params.id, shop: req.shopId });
    if (!batch) {
      return res.status(404).json({ error: 'Cooking batch not found' });
    }
    res.json(batch);
  } catch (err) {
    sendError(res, err);
  }
});

// Cancel rather than delete: the ingredients go back and the dish comes out of stock.
// Editing a batch is done by cancelling it and entering it again.
router.delete('/:id', async (req, res) => {
  try {
    const batch = await Production.findOne({ _id: req.params.id, shop: req.shopId });
    if (!batch) {
      return res.status(404).json({ error: 'Cooking batch not found' });
    }
    if (batch.voided_at) {
      return res.status(400).json({ error: 'This batch is already cancelled' });
    }

    const ctx = writeContext(req);

    // Some of the dish may already have been sold; taking all of it back would
    // drive stock negative, so the owner has to confirm that.
    const allowNegative = req.body?.allow_negative === true;
    const shortfalls = await findShortfalls(req.shopId, [
      { item_name: batch.dish_name, quantity: batch.quantity },
    ]);
    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const voided = await runInTransaction(async (session) => {
      for (const ing of batch.ingredients) {
        await moveStock({
          shop: req.shopId,
          item_name: ing.item_name,
          delta: ing.quantity,
          reason: 'void',
          ref_model: 'Production',
          ref_id: batch._id,
          cost_per_unit: ing.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'cooking batch cancelled',
          allowNegative: true,
          session,
        });
      }

      await moveStock({
        shop: req.shopId,
        item_name: batch.dish_name,
        delta: -batch.quantity,
        reason: 'void',
        ref_model: 'Production',
        ref_id: batch._id,
        cost_per_unit: batch.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'cooking batch cancelled',
        allowNegative,
        session,
      });

      batch.voided_at = ctx.date;
      batch.voided_by = ctx.username;
      batch.void_reason = req.body && req.body.reason;
      batch.updated_at = new Date();
      await batch.save({ session });
      return batch;
    });

    res.json({ cancelled: true, production: voided });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
