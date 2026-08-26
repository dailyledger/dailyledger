const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const Item = require('../models/Item');
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

// Credit is a sale that hasn't been paid for yet, so line resolution is
// identical to sales.js: the server computes every derived number (blocker 04)
// and freezes the cost at the moment the goods left the shop (blocker 02).
async function resolveLines(shop, rawItems, previousLines = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new BadRequestError('At least one item is required');
  }

  const previousByName = new Map(previousLines.map((l) => [l.item_name.trim().toLowerCase(), l]));
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
        `Item "${raw.item_name}" must be purchased/added first before it can be given on credit`
      );
    }
    if (raw.unit_type && catalogItem.unit_type !== raw.unit_type) {
      throw new BadRequestError(
        `Unit type mismatch for "${catalogItem.item_name}": catalog uses ` +
          `"${catalogItem.unit_type}", credit uses "${raw.unit_type}"`
      );
    }

    const previous = previousByName.get(catalogItem.item_name.toLowerCase());
    const quantity = round3(raw.quantity);
    const pricePerUnit = round2(raw.price_per_unit);

    lines.push({
      item_name: catalogItem.item_name,
      unit_type: catalogItem.unit_type,
      quantity,
      price_per_unit: pricePerUnit,
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

function statusFor(amountPaid, total) {
  if (amountPaid >= total) return 'paid';
  return amountPaid > 0 ? 'partially_paid' : 'unpaid';
}

router.post('/', async (req, res) => {
  try {
    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(Credit, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    if (!req.body.customer_name || !String(req.body.customer_name).trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const ctx = writeContext(req, req.body.date);
    const lines = await resolveLines(req.shopId, req.body.items);

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

    const credit = await runInTransaction(async (session) => {
      const created = new Credit({
        shop: ctx.shop,
        customer_name: String(req.body.customer_name).trim(),
        phone: req.body.phone,
        items: lines,
        total_amount: totalOf(lines),
        amount_paid: 0,
        status: 'unpaid',
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
          reason: 'credit',
          ref_model: 'Credit',
          ref_id: created._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          allowNegative,
          session,
        });

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

    res.status(201).json(credit);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const credits = await Credit.find(buildQuery(req)).sort({ date: -1 });

    const enriched = credits.map((credit) => ({
      ...credit.toObject(),
      balance: round2(credit.total_amount - credit.amount_paid),
    }));

    res.json(enriched);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    res.json(credit);
  } catch (err) {
    sendError(res, err);
  }
});

router.patch('/:id/pay', async (req, res) => {
  try {
    const { amount_paid } = req.body;

    if (!isPositiveNumber(amount_paid)) {
      return res.status(400).json({ error: 'amount_paid must be a positive number' });
    }

    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    if (credit.voided_at) {
      return res.status(400).json({ error: 'This credit entry has been cancelled' });
    }

    const payment = round2(amount_paid);
    const outstanding = round2(credit.total_amount - credit.amount_paid);

    if (payment > outstanding) {
      return res.status(400).json({
        error: `Payment of ${payment} exceeds the outstanding balance of ${outstanding}`,
      });
    }

    credit.amount_paid = round2(credit.amount_paid + payment);
    credit.status = statusFor(credit.amount_paid, credit.total_amount);
    credit.updated_at = new Date();

    await credit.save();
    res.json(credit);
  } catch (err) {
    sendError(res, err);
  }
});

// Blocker 03: mirror of the sales edit — restore the original quantities, then
// take the new ones, both inside a single transaction.
router.put('/:id', async (req, res) => {
  try {
    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    if (credit.voided_at) {
      return res.status(400).json({ error: 'This credit entry has been cancelled' });
    }

    const ctx = writeContext(req, req.body.date || credit.date);
    const originalLines = credit.items.map((l) => l.toObject());
    const lines = await resolveLines(req.shopId, req.body.items, originalLines);
    const newTotal = totalOf(lines);

    if (credit.amount_paid > newTotal) {
      return res.status(400).json({
        error:
          `Cannot reduce this credit to ${newTotal}: ${credit.amount_paid} has already been ` +
          `collected against it.`,
      });
    }

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
      for (const line of originalLines) {
        await moveStock({
          shop: req.shopId,
          item_name: line.item_name,
          delta: line.quantity,
          reason: 'edit',
          ref_model: 'Credit',
          ref_id: credit._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'reverse original credit line before edit',
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
          ref_model: 'Credit',
          ref_id: credit._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'apply edited credit line',
          allowNegative,
          session,
        });
      }

      credit.customer_name = req.body.customer_name
        ? String(req.body.customer_name).trim()
        : credit.customer_name;
      credit.phone = req.body.phone;
      credit.items = lines;
      credit.total_amount = newTotal;
      credit.status = statusFor(credit.amount_paid, newTotal);
      credit.notes = req.body.notes;
      credit.date = ctx.date;
      credit.date_key = ctx.date_key;
      credit.stock_warning = shortfalls.length ? describeShortfalls(shortfalls) : null;
      credit.updated_at = new Date();

      await credit.save({ session });
      return credit;
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// Blocker 06a: cancel rather than delete, returning the goods to stock.
router.delete('/:id', async (req, res) => {
  try {
    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    if (credit.voided_at) {
      return res.status(400).json({ error: 'This credit entry is already cancelled' });
    }
    if (credit.amount_paid > 0) {
      return res.status(400).json({
        error:
          `Cannot cancel this credit: ${credit.amount_paid} has already been collected. ` +
          `Record a refund first if the goods were returned.`,
      });
    }

    const ctx = writeContext(req);

    const voided = await runInTransaction(async (session) => {
      for (const line of credit.items) {
        await moveStock({
          shop: req.shopId,
          item_name: line.item_name,
          delta: line.quantity,
          reason: 'void',
          ref_model: 'Credit',
          ref_id: credit._id,
          cost_per_unit: line.cost_per_unit,
          date: ctx.date,
          date_key: ctx.date_key,
          note: 'credit cancelled',
          allowNegative: true,
          session,
        });
      }

      credit.voided_at = ctx.date;
      credit.voided_by = ctx.username;
      credit.void_reason = req.body && req.body.reason;
      credit.updated_at = new Date();

      await credit.save({ session });
      return credit;
    });

    res.json({ cancelled: true, credit: voided });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
