const express = require('express');
const router = express.Router();
const Spoilage = require('../models/Spoilage');
const Item = require('../models/Item');
const buildQuery = require('../utils/dateFilter');
const { BadRequestError } = require('../utils/dateFilter');
const { round2, round3, isPositiveNumber } = require('../utils/money');
const { findShortfalls, moveStock } = require('../utils/stock');
const { runInTransaction } = require('../utils/tx');
const {
  writeContext,
  findByIdempotencyKey,
  idempotencyKeyFrom,
  sendError,
  describeShortfalls,
} = require('../utils/ledger');

const REASONS = ['spoiled', 'expired', 'damaged'];

/**
 * Blocker 02/04: spoilage is valued at what the goods cost us, taken from the
 * catalog — not from a number the client guessed at.
 */
async function resolveEntry(shop, body) {
  if (!body || typeof body.item_name !== 'string' || !body.item_name.trim()) {
    throw new BadRequestError('Item name is required');
  }
  if (!isPositiveNumber(body.quantity)) {
    throw new BadRequestError('Quantity must be greater than 0');
  }
  if (!REASONS.includes(body.reason)) {
    throw new BadRequestError(`Reason must be one of: ${REASONS.join(', ')}`);
  }

  const catalogItem = await Item.findByName(shop, body.item_name);
  if (!catalogItem) {
    throw new BadRequestError(
      `Item "${body.item_name}" must be purchased/added first before it can be marked as spoilage`
    );
  }
  if (body.unit_type && catalogItem.unit_type !== body.unit_type) {
    throw new BadRequestError(
      `Unit type mismatch for "${catalogItem.item_name}": catalog uses ` +
        `"${catalogItem.unit_type}", entry uses "${body.unit_type}"`
    );
  }

  const quantity = round3(body.quantity);
  const costPerUnit = round2(catalogItem.last_cost_price);

  return {
    item_name: catalogItem.item_name,
    unit_type: catalogItem.unit_type,
    quantity,
    cost_per_unit: costPerUnit,
    estimated_value: round2(quantity * costPerUnit),
    reason: body.reason,
  };
}

router.post('/', async (req, res) => {
  try {
    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(Spoilage, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const ctx = writeContext(req, req.body.date);
    const entry = await resolveEntry(req.shopId, req.body);

    const allowNegative = req.body.allow_negative === true;
    const shortfalls = await findShortfalls(req.shopId, [entry]);

    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const spoilage = await runInTransaction(async (session) => {
      const created = new Spoilage({
        shop: ctx.shop,
        ...entry,
        date: ctx.date,
        date_key: ctx.date_key,
        notes: req.body.notes,
        stock_warning: shortfalls.length ? describeShortfalls(shortfalls) : null,
        idempotency_key: idempotencyKey,
      });

      await created.save({ session });

      await moveStock({
        shop: ctx.shop,
        item_name: entry.item_name,
        delta: -entry.quantity,
        reason: 'spoilage',
        ref_model: 'Spoilage',
        ref_id: created._id,
        cost_per_unit: entry.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        allowNegative,
        session,
      });

      return created;
    });

    res.status(201).json(spoilage);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const entries = await Spoilage.find(buildQuery(req)).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const spoilage = await Spoilage.findOne({ _id: req.params.id, shop: req.shopId });
    if (!spoilage) {
      return res.status(404).json({ error: 'Spoilage entry not found' });
    }
    res.json(spoilage);
  } catch (err) {
    sendError(res, err);
  }
});

// Blocker 03: the old PUT changed the record but never touched stock.
router.put('/:id', async (req, res) => {
  try {
    const spoilage = await Spoilage.findOne({ _id: req.params.id, shop: req.shopId });
    if (!spoilage) {
      return res.status(404).json({ error: 'Spoilage entry not found' });
    }
    if (spoilage.voided_at) {
      return res.status(400).json({ error: 'This entry has been cancelled and cannot be edited' });
    }

    const ctx = writeContext(req, req.body.date || spoilage.date);
    const entry = await resolveEntry(req.shopId, req.body);

    // Carry the original cost forward when the item hasn't changed — the goods
    // spoiled at the cost they were bought at.
    if (entry.item_name === spoilage.item_name) {
      entry.cost_per_unit = spoilage.cost_per_unit;
      entry.estimated_value = round2(entry.quantity * entry.cost_per_unit);
    }

    const sameItem = entry.item_name === spoilage.item_name;
    const netTake = sameItem
      ? round3(entry.quantity - spoilage.quantity)
      : entry.quantity;

    const allowNegative = req.body.allow_negative === true;
    const shortfalls =
      netTake > 0
        ? await findShortfalls(req.shopId, [{ item_name: entry.item_name, quantity: netTake }])
        : [];

    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const updated = await runInTransaction(async (session) => {
      await moveStock({
        shop: req.shopId,
        item_name: spoilage.item_name,
        delta: spoilage.quantity,
        reason: 'edit',
        ref_model: 'Spoilage',
        ref_id: spoilage._id,
        cost_per_unit: spoilage.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'reverse original spoilage before edit',
        allowNegative: true,
        session,
      });

      await moveStock({
        shop: req.shopId,
        item_name: entry.item_name,
        delta: -entry.quantity,
        reason: 'edit',
        ref_model: 'Spoilage',
        ref_id: spoilage._id,
        cost_per_unit: entry.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'apply edited spoilage',
        allowNegative,
        session,
      });

      Object.assign(spoilage, entry);
      spoilage.notes = req.body.notes;
      spoilage.date = ctx.date;
      spoilage.date_key = ctx.date_key;
      spoilage.stock_warning = shortfalls.length ? describeShortfalls(shortfalls) : null;
      spoilage.updated_at = new Date();

      await spoilage.save({ session });
      return spoilage;
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// Blocker 06a: cancel rather than delete, putting the goods back.
router.delete('/:id', async (req, res) => {
  try {
    const spoilage = await Spoilage.findOne({ _id: req.params.id, shop: req.shopId });
    if (!spoilage) {
      return res.status(404).json({ error: 'Spoilage entry not found' });
    }
    if (spoilage.voided_at) {
      return res.status(400).json({ error: 'This entry is already cancelled' });
    }

    const ctx = writeContext(req);

    const voided = await runInTransaction(async (session) => {
      await moveStock({
        shop: req.shopId,
        item_name: spoilage.item_name,
        delta: spoilage.quantity,
        reason: 'void',
        ref_model: 'Spoilage',
        ref_id: spoilage._id,
        cost_per_unit: spoilage.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'spoilage cancelled',
        allowNegative: true,
        session,
      });

      spoilage.voided_at = ctx.date;
      spoilage.voided_by = ctx.username;
      spoilage.void_reason = req.body && req.body.reason;
      spoilage.updated_at = new Date();

      await spoilage.save({ session });
      return spoilage;
    });

    res.json({ cancelled: true, spoilage: voided });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
