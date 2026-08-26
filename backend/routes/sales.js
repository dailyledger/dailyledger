const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const SalesReturn = require('../models/SalesReturn');
const buildQuery = require('../utils/dateFilter');
const { BadRequestError } = require('../utils/dateFilter');
const { round2, round3, isPositiveNumber, isNonNegativeNumber } = require('../utils/money');
const { findShortfalls, moveStock } = require('../utils/stock');
const { runInTransaction } = require('../utils/tx');
const {
  writeContext,
  findByIdempotencyKey,
  idempotencyKeyFrom,
  sendError,
  describeShortfalls,
} = require('../utils/ledger');

/**
 * Blocker 04: the client sends only what it observed — item, quantity, price.
 * Every derived number (line_total, total_amount, cost_per_unit) is computed
 * here and the client's version is ignored entirely.
 *
 * `previousLines` carries costs forward on an edit: the goods left the shop at
 * the old cost, so re-snapshotting today's cost would rewrite history.
 */
async function resolveLines(shop, rawItems, previousLines = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new BadRequestError('At least one item is required');
  }

  const previousByName = new Map(
    previousLines.map((l) => [l.item_name.trim().toLowerCase(), l])
  );

  const lines = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw.item_name !== 'string' || !raw.item_name.trim()) {
      throw new BadRequestError('Every line needs an item name');
    }
    if (!isPositiveNumber(raw.quantity)) {
      throw new BadRequestError(`Quantity for "${raw.item_name}" must be greater than 0`);
    }
    if (!isNonNegativeNumber(raw.price_per_unit)) {
      throw new BadRequestError(`Price for "${raw.item_name}" must be 0 or more`);
    }

    const catalogItem = await Item.findByName(shop, raw.item_name);
    if (!catalogItem) {
      throw new BadRequestError(
        `Item "${raw.item_name}" must be purchased/added first before it can be sold`
      );
    }
    if (raw.unit_type && catalogItem.unit_type !== raw.unit_type) {
      throw new BadRequestError(
        `Unit type mismatch for "${catalogItem.item_name}": catalog uses ` +
          `"${catalogItem.unit_type}", sale uses "${raw.unit_type}"`
      );
    }

    const previous = previousByName.get(catalogItem.item_name.toLowerCase());
    const quantity = round3(raw.quantity);
    const pricePerUnit = round2(raw.price_per_unit);

    lines.push({
      // Store the catalog's spelling, not what was typed, so "banana" and
      // "Banana" cannot drift apart in the ledger.
      item_name: catalogItem.item_name,
      unit_type: catalogItem.unit_type,
      quantity,
      price_per_unit: pricePerUnit,
      // Blocker 02: freeze the cost at the time of sale.
      cost_per_unit: previous ? previous.cost_per_unit : round2(catalogItem.last_cost_price),
      line_total: round2(quantity * pricePerUnit),
      bargained: Boolean(raw.bargained),
    });
  }

  return lines;
}

function totalOf(lines) {
  return round2(lines.reduce((sum, line) => sum + line.line_total, 0));
}

function validatePaymentMode(mode) {
  if (!['cash', 'gpay'].includes(mode)) {
    throw new BadRequestError('Payment mode must be "cash" or "gpay"');
  }
  return mode;
}

router.post('/', async (req, res) => {
  try {
    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(Sale, req.shopId, idempotencyKey);
    if (existing) {
      // Blocker 06c: same submission arriving twice. Return what we already saved.
      return res.status(200).json(existing);
    }

    const ctx = writeContext(req, req.body.date);
    const lines = await resolveLines(req.shopId, req.body.items);
    const paymentMode = validatePaymentMode(req.body.payment_mode);

    // Blocker 06b: staff record sales that have already happened. If our count
    // says there is not enough, our count is what is wrong — so warn and let
    // them confirm rather than refusing to record reality.
    const allowNegative = req.body.allow_negative === true;
    const shortfalls = await findShortfalls(req.shopId, lines);

    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const sale = await runInTransaction(async (session) => {
      const created = new Sale({
        shop: ctx.shop,
        items: lines,
        total_amount: totalOf(lines),
        payment_mode: paymentMode,
        date: ctx.date,
        date_key: ctx.date_key,
        notes: req.body.notes,
        stock_warning: shortfalls.length ? describeShortfalls(shortfalls) : null,
        idempotency_key: idempotencyKey,
      });

      await created.save({ session });

      for (const line of lines) {
        await moveStock({
          shop: ctx.shop,
          item_name: line.item_name,
          delta: -line.quantity,
          reason: 'sale',
          ref_model: 'Sale',
          ref_id: created._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          allowNegative,
          session,
        });

        // A bargained price is a one-off, so it must not become the item's
        // standing selling price.
        if (!line.bargained) {
          await Item.updateOne(
            { shop: ctx.shop, item_name: line.item_name },
            { $set: { last_selling_price: line.price_per_unit } },
            session ? { session } : undefined
          );
        }
      }

      return created;
    });

    res.status(201).json(sale);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const sales = await Sale.find(buildQuery(req)).sort({ date: -1 });

    const returns = await SalesReturn.find({
      shop: req.shopId,
      sale_id: { $in: sales.map((s) => s._id) },
      voided_at: null,
    });

    const returnsBySale = {};
    for (const r of returns) {
      const key = r.sale_id.toString();
      (returnsBySale[key] = returnsBySale[key] || []).push(r);
    }

    const enriched = sales.map((sale) => {
      const saleReturns = returnsBySale[sale._id.toString()] || [];
      const returned_quantity = round3(saleReturns.reduce((sum, r) => sum + r.quantity, 0));
      const returned_amount = round2(saleReturns.reduce((sum, r) => sum + r.refund_amount, 0));
      const returnedByItem = {};
      for (const r of saleReturns) {
        returnedByItem[r.item_name] = round3((returnedByItem[r.item_name] || 0) + r.quantity);
      }

      // Blocker 02: real margin, from the cost frozen on each line.
      const grossCost = round2(sale.items.reduce((sum, l) => sum + l.quantity * l.cost_per_unit, 0));
      const returnedCost = round2(
        saleReturns.reduce((sum, r) => sum + r.quantity * (r.cost_per_unit || 0), 0)
      );

      return {
        ...sale.toObject(),
        returned_quantity,
        returned_amount,
        returned_by_item: returnedByItem,
        net_amount: round2(sale.total_amount - returned_amount),
        gross_profit: round2(sale.total_amount - returned_amount - (grossCost - returnedCost)),
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, shop: req.shopId });
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Blocker 03: editing used to update the sale document and leave stock untouched,
 * so correcting 4kg to 3kg left 4kg deducted forever.
 *
 * The edit restores every original line to stock, then takes the new quantities.
 * Both happen in one transaction, and both append movement rows, so the change is
 * visible in the item's history rather than being a silent overwrite.
 */
router.put('/:id', async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, shop: req.shopId });
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    if (sale.voided_at) {
      return res.status(400).json({ error: 'This sale has been cancelled and cannot be edited' });
    }

    const returnCount = await SalesReturn.countDocuments({
      shop: req.shopId,
      sale_id: sale._id,
      voided_at: null,
    });
    if (returnCount > 0) {
      return res.status(400).json({
        error:
          'This sale has returns recorded against it. Cancel the returns first, then edit the sale.',
      });
    }

    const ctx = writeContext(req, req.body.date || sale.date);
    const originalLines = sale.items.map((l) => l.toObject());
    const lines = await resolveLines(req.shopId, req.body.items, originalLines);
    const paymentMode = validatePaymentMode(req.body.payment_mode);

    // Net effect per item: what we give back minus what we take. Only a net
    // increase in quantity can push stock negative.
    const net = new Map();
    for (const line of originalLines) {
      net.set(line.item_name, round3((net.get(line.item_name) || 0) + line.quantity));
    }
    for (const line of lines) {
      net.set(line.item_name, round3((net.get(line.item_name) || 0) - line.quantity));
    }

    const netTakes = [...net.entries()]
      .filter(([, delta]) => delta < 0)
      .map(([item_name, delta]) => ({ item_name, quantity: -delta }));

    const allowNegative = req.body.allow_negative === true;
    const shortfalls = await findShortfalls(req.shopId, netTakes);

    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const updated = await runInTransaction(async (session) => {
      // Restore first, then take — so the guard on the take sees the stock the
      // original sale had reserved.
      for (const line of originalLines) {
        await moveStock({
          shop: req.shopId,
          item_name: line.item_name,
          delta: line.quantity,
          reason: 'edit',
          ref_model: 'Sale',
          ref_id: sale._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'reverse original sale line before edit',
          allowNegative: true,
          session,
        });
      }

      for (const line of lines) {
        await moveStock({
          shop: req.shopId,
          item_name: line.item_name,
          delta: -line.quantity,
          reason: 'edit',
          ref_model: 'Sale',
          ref_id: sale._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'apply edited sale line',
          allowNegative,
          session,
        });

        if (!line.bargained) {
          await Item.updateOne(
            { shop: req.shopId, item_name: line.item_name },
            { $set: { last_selling_price: line.price_per_unit } },
            session ? { session } : undefined
          );
        }
      }

      sale.items = lines;
      sale.total_amount = totalOf(lines);
      sale.payment_mode = paymentMode;
      sale.notes = req.body.notes;
      sale.date = ctx.date;
      sale.date_key = ctx.date_key;
      sale.stock_warning = shortfalls.length ? describeShortfalls(shortfalls) : null;
      sale.updated_at = new Date();

      await sale.save({ session });
      return sale;
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Blocker 06a: money records are never removed. Voiding returns the stock and
 * marks the document, so reports exclude it while the history of what happened —
 * and who cancelled it — survives.
 */
router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, shop: req.shopId });
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    if (sale.voided_at) {
      return res.status(400).json({ error: 'This sale is already cancelled' });
    }

    const returnCount = await SalesReturn.countDocuments({
      shop: req.shopId,
      sale_id: sale._id,
      voided_at: null,
    });
    if (returnCount > 0) {
      return res.status(400).json({
        error: 'Cancel the returns recorded against this sale first.',
      });
    }

    const ctx = writeContext(req);

    const voided = await runInTransaction(async (session) => {
      for (const line of sale.items) {
        await moveStock({
          shop: req.shopId,
          item_name: line.item_name,
          delta: line.quantity,
          reason: 'void',
          ref_model: 'Sale',
          ref_id: sale._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'sale cancelled',
          allowNegative: true,
          session,
        });
      }

      sale.voided_at = ctx.date;
      sale.voided_by = ctx.username;
      sale.void_reason = req.body && req.body.reason;
      sale.updated_at = new Date();

      await sale.save({ session });
      return sale;
    });

    res.json({ cancelled: true, sale: voided });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/returns', async (req, res) => {
  try {
    const returns = await SalesReturn.find({
      shop: req.shopId,
      sale_id: req.params.id,
      voided_at: null,
    }).sort({ date: -1 });
    res.json(returns);
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/return', async (req, res) => {
  try {
    const { item_name, quantity, reason } = req.body;

    if (!isPositiveNumber(quantity)) {
      return res.status(400).json({ error: 'Return quantity must be greater than 0' });
    }

    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(SalesReturn, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const sale = await Sale.findOne({ _id: req.params.id, shop: req.shopId });
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    if (sale.voided_at) {
      return res.status(400).json({ error: 'This sale has been cancelled' });
    }

    const wanted = String(item_name || '').trim().toLowerCase();
    const lineItem = sale.items.find((item) => item.item_name.toLowerCase() === wanted);
    if (!lineItem) {
      return res.status(400).json({ error: `"${item_name}" was not part of this sale` });
    }

    const existingReturns = await SalesReturn.find({
      shop: req.shopId,
      sale_id: sale._id,
      item_name: lineItem.item_name,
      voided_at: null,
    });
    const alreadyReturned = round3(existingReturns.reduce((sum, r) => sum + r.quantity, 0));
    const returnable = round3(lineItem.quantity - alreadyReturned);

    if (quantity > returnable) {
      return res.status(400).json({
        error:
          `Cannot return ${quantity} of "${lineItem.item_name}": only ${returnable} unit(s) ` +
          `remain returnable (${lineItem.quantity} sold, ${alreadyReturned} already returned).`,
      });
    }

    const ctx = writeContext(req, req.body.date);
    const returnQty = round3(quantity);

    const salesReturn = await runInTransaction(async (session) => {
      const created = new SalesReturn({
        shop: ctx.shop,
        sale_id: sale._id,
        item_name: lineItem.item_name,
        quantity: returnQty,
        reason: reason || undefined,
        refund_amount: round2(returnQty * lineItem.price_per_unit),
        cost_per_unit: lineItem.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        idempotency_key: idempotencyKey,
      });

      await created.save({ session });

      await moveStock({
        shop: ctx.shop,
        item_name: lineItem.item_name,
        delta: returnQty,
        reason: 'sales_return',
        ref_model: 'SalesReturn',
        ref_id: created._id,
        cost_per_unit: lineItem.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        allowNegative: true,
        session,
      });

      return created;
    });

    res.status(201).json(salesReturn);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
