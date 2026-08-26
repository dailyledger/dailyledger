const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const PurchaseReturn = require('../models/PurchaseReturn');
const buildQuery = require('../utils/dateFilter');
const { BadRequestError } = require('../utils/dateFilter');
const { round2, round3, isPositiveNumber } = require('../utils/money');
const { moveStock } = require('../utils/stock');
const { runInTransaction } = require('../utils/tx');
const {
  writeContext,
  findByIdempotencyKey,
  idempotencyKeyFrom,
  sendError,
} = require('../utils/ledger');

// A purchase may be entered in packs (a 50kg sack) while stock is tracked in
// units (kg). quantity * units_per_pack is what actually reaches the shelf.
function packSize(unitsPerPack) {
  return unitsPerPack && unitsPerPack > 1 ? unitsPerPack : 1;
}

/**
 * Blocker 04: the server derives cost per unit rather than trusting the client,
 * and rounds it — `amount / totalUnits` is exactly where float drift enters.
 */
function resolvePurchase(body) {
  if (!body.vendor_name || !String(body.vendor_name).trim()) {
    throw new BadRequestError('Vendor name is required');
  }
  if (!body.item_name || !String(body.item_name).trim()) {
    throw new BadRequestError('Item name is required');
  }
  if (!isPositiveNumber(body.quantity)) {
    throw new BadRequestError('Quantity must be greater than 0');
  }
  if (!['kg', 'litre', 'piece'].includes(body.unit_type)) {
    throw new BadRequestError('Unit type must be kg, litre or piece');
  }
  if (!['cash', 'gpay'].includes(body.payment_mode)) {
    throw new BadRequestError('Payment mode must be "cash" or "gpay"');
  }

  const unitsPerPack = packSize(body.units_per_pack);
  const quantity = round3(body.quantity);

  // Blocker 04 again: the total is quantity x rate, and the server does that
  // multiplication. `amount` is still accepted so older clients and existing
  // records keep working, but a rate always wins over a client-sent total.
  let rate;
  let amount;

  if (isPositiveNumber(body.rate)) {
    rate = round2(body.rate);
    amount = round2(quantity * rate);
  } else if (isPositiveNumber(body.amount)) {
    amount = round2(body.amount);
    rate = round2(amount / quantity);
  } else {
    throw new BadRequestError('Rate must be greater than 0');
  }

  const totalStockUnits = round3(quantity * unitsPerPack);

  return {
    vendor_name: String(body.vendor_name).trim(),
    item_name: String(body.item_name).trim(),
    unit_type: body.unit_type,
    quantity,
    rate,
    amount,
    units_per_pack: unitsPerPack,
    payment_mode: body.payment_mode,
    totalStockUnits,
    // Cost per stock unit: a 50kg sack at 3000 is 60/kg on the shelf.
    costPerUnit: totalStockUnits ? round2(amount / totalStockUnits) : 0,
  };
}

router.post('/', async (req, res) => {
  try {
    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(Purchase, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const { selling_price } = req.body;
    if (!isPositiveNumber(selling_price)) {
      return res
        .status(400)
        .json({ error: 'Selling price is required and must be greater than 0' });
    }

    const ctx = writeContext(req, req.body.date);
    const p = resolvePurchase(req.body);
    const sellingPrice = round2(selling_price);

    const purchase = await runInTransaction(async (session) => {
      // Purchases are the only way an item enters the catalog — creating one
      // directly would let it be sold with stock that was never bought.
      let catalogItem = await Item.findByName(req.shopId, p.item_name, session);

      if (!catalogItem) {
        const docs = await Item.create(
          [
            {
              shop: ctx.shop,
              item_name: p.item_name,
              unit_type: p.unit_type,
              stock_quantity: 0,
              last_cost_price: p.costPerUnit,
              last_selling_price: sellingPrice,
            },
          ],
          session ? { session } : undefined
        );
        catalogItem = docs[0];
      } else {
        await Item.updateOne(
          { _id: catalogItem._id },
          { $set: { last_cost_price: p.costPerUnit, last_selling_price: sellingPrice } },
          session ? { session } : undefined
        );
      }

      const created = new Purchase({
        shop: ctx.shop,
        vendor_name: p.vendor_name,
        item_name: catalogItem.item_name,
        quantity: p.quantity,
        unit_type: catalogItem.unit_type,
        rate: p.rate,
        amount: p.amount,
        units_per_pack: p.units_per_pack,
        payment_mode: p.payment_mode,
        date: ctx.date,
        date_key: ctx.date_key,
        notes: req.body.notes,
        idempotency_key: idempotencyKey,
      });

      await created.save({ session });

      await moveStock({
        shop: ctx.shop,
        item_name: catalogItem.item_name,
        delta: p.totalStockUnits,
        reason: 'purchase',
        ref_model: 'Purchase',
        ref_id: created._id,
        cost_per_unit: p.costPerUnit,
        date: ctx.date,
        date_key: ctx.date_key,
        session,
      });

      return created;
    });

    res.status(201).json(purchase);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const purchases = await Purchase.find(buildQuery(req)).sort({ date: -1 });

    const returns = await PurchaseReturn.find({
      shop: req.shopId,
      purchase_id: { $in: purchases.map((p) => p._id) },
      voided_at: null,
    });

    const returnsByPurchase = {};
    for (const r of returns) {
      const key = r.purchase_id.toString();
      (returnsByPurchase[key] = returnsByPurchase[key] || []).push(r);
    }

    const enriched = purchases.map((purchase) => {
      const purchaseReturns = returnsByPurchase[purchase._id.toString()] || [];
      const returned_quantity = round3(purchaseReturns.reduce((sum, r) => sum + r.quantity, 0));
      const returned_amount = round2(purchaseReturns.reduce((sum, r) => sum + r.refund_amount, 0));

      return {
        ...purchase.toObject(),
        returned_quantity,
        returned_amount,
        net_quantity: round3(purchase.quantity - returned_quantity),
        net_amount: round2(purchase.amount - returned_amount),
      };
    });

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, shop: req.shopId });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    res.json(purchase);
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, shop: req.shopId });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    if (purchase.voided_at) {
      return res
        .status(400)
        .json({ error: 'This purchase has been cancelled and cannot be edited' });
    }

    const returnCount = await PurchaseReturn.countDocuments({
      shop: req.shopId,
      purchase_id: purchase._id,
      voided_at: null,
    });
    if (returnCount > 0) {
      return res.status(400).json({
        error:
          'This purchase has returns recorded against it. Cancel the returns first, then edit it.',
      });
    }

    const ctx = writeContext(req, req.body.date || purchase.date);
    const p = resolvePurchase({ ...req.body, item_name: req.body.item_name || purchase.item_name });

    const oldUnitsPerPack = packSize(purchase.units_per_pack);
    const oldTotalUnits = round3(purchase.quantity * oldUnitsPerPack);

    const newItem = await Item.findByName(req.shopId, p.item_name);
    if (!newItem) {
      return res.status(400).json({ error: `Item "${p.item_name}" not found in this shop` });
    }

    // Removing this purchase's stock must not drive the item negative — that
    // would mean more has already been sold than this purchase ever supplied.
    const oldItem = await Item.findByName(req.shopId, purchase.item_name);
    if (oldItem && round3(oldItem.stock_quantity - oldTotalUnits) < 0) {
      const shortBy = round3(oldTotalUnits - oldItem.stock_quantity);
      return res.status(400).json({
        error:
          `Cannot edit this purchase: ${shortBy} unit(s) of "${purchase.item_name}" that it ` +
          `supplied have already been sold, credited or spoiled. Cancel those entries first.`,
      });
    }

    const updated = await runInTransaction(async (session) => {
      // Reverse the original contribution, then apply the new one.
      await moveStock({
        shop: req.shopId,
        item_name: purchase.item_name,
        delta: -oldTotalUnits,
        reason: 'edit',
        ref_model: 'Purchase',
        ref_id: purchase._id,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'reverse original purchase before edit',
        allowNegative: true,
        session,
      });

      await moveStock({
        shop: req.shopId,
        item_name: newItem.item_name,
        delta: p.totalStockUnits,
        reason: 'edit',
        ref_model: 'Purchase',
        ref_id: purchase._id,
        cost_per_unit: p.costPerUnit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'apply edited purchase',
        session,
      });

      await Item.updateOne(
        { _id: newItem._id },
        { $set: { last_cost_price: p.costPerUnit } },
        session ? { session } : undefined
      );

      purchase.vendor_name = p.vendor_name;
      purchase.item_name = newItem.item_name;
      purchase.quantity = p.quantity;
      purchase.unit_type = newItem.unit_type;
      purchase.rate = p.rate;
      purchase.amount = p.amount;
      purchase.units_per_pack = p.units_per_pack;
      purchase.payment_mode = p.payment_mode;
      purchase.notes = req.body.notes;
      purchase.date = ctx.date;
      purchase.date_key = ctx.date_key;
      purchase.updated_at = new Date();

      await purchase.save({ session });
      return purchase;
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// Blocker 06a: cancel rather than delete. Removes the stock this purchase added.
router.delete('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, shop: req.shopId });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    if (purchase.voided_at) {
      return res.status(400).json({ error: 'This purchase is already cancelled' });
    }

    const returnCount = await PurchaseReturn.countDocuments({
      shop: req.shopId,
      purchase_id: purchase._id,
      voided_at: null,
    });
    if (returnCount > 0) {
      return res.status(400).json({
        error: 'Cancel the returns recorded against this purchase first.',
      });
    }

    const totalUnits = round3(purchase.quantity * packSize(purchase.units_per_pack));
    const item = await Item.findByName(req.shopId, purchase.item_name);

    if (item && round3(item.stock_quantity - totalUnits) < 0) {
      const shortBy = round3(totalUnits - item.stock_quantity);
      return res.status(400).json({
        error:
          `Cannot cancel this purchase: ${shortBy} unit(s) of "${purchase.item_name}" it ` +
          `supplied have already been sold, credited or spoiled.`,
      });
    }

    const ctx = writeContext(req);

    const voided = await runInTransaction(async (session) => {
      await moveStock({
        shop: req.shopId,
        item_name: purchase.item_name,
        delta: -totalUnits,
        reason: 'void',
        ref_model: 'Purchase',
        ref_id: purchase._id,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'purchase cancelled',
        allowNegative: true,
        session,
      });

      purchase.voided_at = ctx.date;
      purchase.voided_by = ctx.username;
      purchase.void_reason = req.body && req.body.reason;
      purchase.updated_at = new Date();

      await purchase.save({ session });
      return purchase;
    });

    res.json({ cancelled: true, purchase: voided });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/returns', async (req, res) => {
  try {
    const returns = await PurchaseReturn.find({
      shop: req.shopId,
      purchase_id: req.params.id,
      voided_at: null,
    }).sort({ date: -1 });
    res.json(returns);
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/return', async (req, res) => {
  try {
    const { quantity, reason } = req.body;

    if (!isPositiveNumber(quantity)) {
      return res.status(400).json({ error: 'Return quantity must be greater than 0' });
    }

    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(PurchaseReturn, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const purchase = await Purchase.findOne({ _id: req.params.id, shop: req.shopId });
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    if (purchase.voided_at) {
      return res.status(400).json({ error: 'This purchase has been cancelled' });
    }

    const existingReturns = await PurchaseReturn.find({
      shop: req.shopId,
      purchase_id: purchase._id,
      voided_at: null,
    });
    const alreadyReturned = round3(existingReturns.reduce((sum, r) => sum + r.quantity, 0));
    const returnable = round3(purchase.quantity - alreadyReturned);

    if (quantity > returnable) {
      return res.status(400).json({
        error:
          `Cannot return ${quantity} of "${purchase.item_name}": only ${returnable} remain ` +
          `returnable (${purchase.quantity} purchased, ${alreadyReturned} already returned).`,
      });
    }

    const returnQty = round3(quantity);
    const unitsPerPack = packSize(purchase.units_per_pack);
    const stockImpact = round3(returnQty * unitsPerPack);

    const item = await Item.findByName(req.shopId, purchase.item_name);
    if (!item || round3(item.stock_quantity - stockImpact) < 0) {
      const available = item ? item.stock_quantity : 0;
      return res.status(400).json({
        error:
          `Cannot return ${returnQty} of "${purchase.item_name}": that is ${stockImpact} stock ` +
          `unit(s), but only ${available} are on hand (some may already have been sold, ` +
          `credited or spoiled).`,
      });
    }

    const ctx = writeContext(req, req.body.date);
    // Cost per pack, so refunding N packs returns what those packs cost.
    const costPerPack = purchase.quantity ? round2(purchase.amount / purchase.quantity) : 0;

    const purchaseReturn = await runInTransaction(async (session) => {
      const created = new PurchaseReturn({
        shop: ctx.shop,
        purchase_id: purchase._id,
        item_name: purchase.item_name,
        quantity: returnQty,
        reason: reason || undefined,
        refund_amount: round2(returnQty * costPerPack),
        date: ctx.date,
        date_key: ctx.date_key,
        idempotency_key: idempotencyKey,
      });

      await created.save({ session });

      await moveStock({
        shop: ctx.shop,
        item_name: purchase.item_name,
        delta: -stockImpact,
        reason: 'purchase_return',
        ref_model: 'PurchaseReturn',
        ref_id: created._id,
        date: ctx.date,
        date_key: ctx.date_key,
        session,
      });

      return created;
    });

    res.status(201).json(purchaseReturn);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
