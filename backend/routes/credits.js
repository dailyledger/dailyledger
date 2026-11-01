const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const CreditPayment = require('../models/CreditPayment');
const CreditReturn = require('../models/CreditReturn');
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
  MAX_UNIT_AMOUNT,
  MAX_QUANTITY,
  MAX_PARTY_NAME,
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
    if (!isSaneQuantity(raw.quantity)) {
      throw new BadRequestError(
        `Quantity for "${raw.item_name}" must be more than 0 and at most ${MAX_QUANTITY}`
      );
    }
    if (!(raw.price_per_unit > 0)) {
      throw new BadRequestError(`Price for "${raw.item_name}" must be greater than 0`);
    }
    if (!isSaneAmount(raw.price_per_unit)) {
      throw new BadRequestError(
        `Price for "${raw.item_name}" must be between 0 and ${MAX_UNIT_AMOUNT}`
      );
    }

    const catalogItem = await Item.findByName(shop, raw.item_name);
    if (!catalogItem) {
      throw new BadRequestError(
        `Item "${raw.item_name}" must be purchased/added first before it can be given on credit`
      );
    }
    if (catalogItem.kind === 'raw') {
      throw new BadRequestError(
        `"${catalogItem.item_name}" is a raw material and cannot be sold. ` +
          'Use it in a cooking batch instead.'
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
      cost_per_unit: previous ? previous.cost_per_unit : round4(catalogItem.last_cost_price),
      line_total: round2(quantity * pricePerUnit),
      bargained: Boolean(raw.bargained),
    });
  }

  // Same reasoning as sales: an exact repeat is a double-entry mistake, while the
  // same item at a different price is a legitimate part-bargained line.
  const seen = new Set();
  for (const line of lines) {
    const signature = `${line.item_name.toLowerCase()}|${line.price_per_unit}`;
    if (seen.has(signature)) {
      throw new BadRequestError(
        `"${line.item_name}" is listed twice at the same price — combine it into one line`
      );
    }
    seen.add(signature);
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

const PAYMENT_MODES = ['cash', 'gpay'];

/** What the customer still owes: the credit, less goods returned, less money paid. */
const balanceOf = (credit) =>
  round2(credit.total_amount - (credit.returned_amount || 0) - credit.amount_paid);

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
    if (String(req.body.customer_name).trim().length > MAX_PARTY_NAME) {
      return res
        .status(400)
        .json({ error: `Customer name must be ${MAX_PARTY_NAME} characters or fewer` });
    }

    const ctx = writeContext(req, req.body.date);
    const lines = await resolveLines(req.shopId, req.body.items);
    for (const line of lines) await assertStockedBy(req.shopId, line.item_name, ctx.date_key);

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
      balance: balanceOf(credit),
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
    const [payments, returns] = await Promise.all([
      CreditPayment.find({ shop: req.shopId, credit_id: credit._id, voided_at: null }).sort({ date: 1 }),
      CreditReturn.find({ shop: req.shopId, credit_id: credit._id, voided_at: null }).sort({ date: 1 }),
    ]);

    res.json({ ...credit.toObject(), balance: balanceOf(credit), payments, returns });
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
    const mode = req.body.payment_mode || 'cash';
    if (!PAYMENT_MODES.includes(mode)) {
      return res.status(400).json({ error: 'Payment mode must be "cash" or "gpay"' });
    }

    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    if (credit.voided_at) {
      return res.status(400).json({ error: 'This credit entry has been cancelled' });
    }

    const payment = round2(amount_paid);
    const outstanding = balanceOf(credit);

    if (payment > outstanding) {
      return res.status(400).json({
        error: `Payment of ${payment} exceeds the outstanding balance of ${outstanding}`,
      });
    }

    const ctx = writeContext(req, req.body.date);

    const updated = await runInTransaction(async (session) => {
      // Every payment is its own record, so the money shows up on the day it came in
      // and under the way it was paid.
      await CreditPayment.create(
        [
          {
            shop: ctx.shop,
            credit_id: credit._id,
            amount: payment,
            kind: 'payment',
            payment_mode: mode,
            date: ctx.date,
            date_key: ctx.date_key,
          },
        ],
        session ? { session } : undefined
      );

      credit.amount_paid = round2(credit.amount_paid + payment);
      credit.status = statusFor(credit.amount_paid, round2(credit.total_amount - (credit.returned_amount || 0)));
      credit.updated_at = new Date();
      await credit.save({ session });
      return credit;
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// A payment entered by mistake: take it back off the credit.
router.delete('/:id/payment/:paymentId', async (req, res) => {
  try {
    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    const payment = await CreditPayment.findOne({
      _id: req.params.paymentId,
      credit_id: req.params.id,
      shop: req.shopId,
    });
    if (!credit || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.voided_at) {
      return res.status(400).json({ error: 'This payment is already cancelled' });
    }
    if (payment.kind === 'refund') {
      return res.status(400).json({ error: 'A refund is undone by cancelling its return' });
    }
    // Part of this payment may already have been handed back through a return.
    if (round2(credit.amount_paid - payment.amount) < 0) {
      return res.status(400).json({
        error: 'Part of this payment was refunded when goods were returned. Cancel the return first.',
      });
    }

    const ctx = writeContext(req);

    const updated = await runInTransaction(async (session) => {
      payment.voided_at = ctx.date;
      payment.voided_by = ctx.username;
      await payment.save({ session });

      credit.amount_paid = round2(credit.amount_paid - payment.amount);
      credit.status = statusFor(credit.amount_paid, round2(credit.total_amount - (credit.returned_amount || 0)));
      credit.updated_at = new Date();
      await credit.save({ session });
      return credit;
    });

    res.json({ cancelled: true, credit: updated });
  } catch (err) {
    sendError(res, err);
  }
});

// Goods brought back from a credit sale: they return to stock, the customer owes
// less, and anything already paid beyond the new total is refunded.
router.post('/:id/return', async (req, res) => {
  try {
    const { item_name, quantity, reason } = req.body;

    if (!isPositiveNumber(quantity)) {
      return res.status(400).json({ error: 'Return quantity must be greater than 0' });
    }
    const refundMode = req.body.refund_mode || 'cash';
    if (!PAYMENT_MODES.includes(refundMode)) {
      return res.status(400).json({ error: 'Refund mode must be "cash" or "gpay"' });
    }

    const idempotencyKey = idempotencyKeyFrom(req);
    const existing = await findByIdempotencyKey(CreditReturn, req.shopId, idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    if (credit.voided_at) {
      return res.status(400).json({ error: 'This credit entry has been cancelled' });
    }

    const wanted = String(item_name || '').trim().toLowerCase();
    const lineItem = credit.items.find((item) => item.item_name.toLowerCase() === wanted);
    if (!lineItem) {
      return res.status(400).json({ error: `"${item_name}" was not part of this credit` });
    }

    const earlier = await CreditReturn.find({
      shop: req.shopId,
      credit_id: credit._id,
      item_name: lineItem.item_name,
      voided_at: null,
    });
    const alreadyReturned = round3(earlier.reduce((sum, r) => sum + r.quantity, 0));
    const returnable = round3(lineItem.quantity - alreadyReturned);
    if (quantity > returnable) {
      return res.status(400).json({
        error:
          `Cannot return ${quantity} of "${lineItem.item_name}": only ${returnable} unit(s) ` +
          `remain returnable (${lineItem.quantity} given, ${alreadyReturned} already returned).`,
      });
    }

    const ctx = writeContext(req, req.body.date);
    const returnQty = round3(quantity);
    const refundAmount = round2(returnQty * lineItem.price_per_unit);

    const created = await runInTransaction(async (session) => {
      const ret = new CreditReturn({
        shop: ctx.shop,
        credit_id: credit._id,
        item_name: lineItem.item_name,
        quantity: returnQty,
        refund_amount: refundAmount,
        cost_per_unit: lineItem.cost_per_unit,
        reason: reason || undefined,
        date: ctx.date,
        date_key: ctx.date_key,
        idempotency_key: idempotencyKey,
      });

      credit.returned_amount = round2((credit.returned_amount || 0) + refundAmount);
      const netTotal = round2(credit.total_amount - credit.returned_amount);

      // The customer already paid more than they now owe: hand the difference back.
      const excess = round2(credit.amount_paid - netTotal);
      if (excess > 0) {
        const [refund] = await CreditPayment.create(
          [
            {
              shop: ctx.shop,
              credit_id: credit._id,
              amount: -excess,
              kind: 'refund',
              payment_mode: refundMode,
              date: ctx.date,
              date_key: ctx.date_key,
              note: `refund for returned ${lineItem.item_name}`,
            },
          ],
          session ? { session } : undefined
        );
        ret.refund_payment_id = refund._id;
        credit.amount_paid = round2(credit.amount_paid - excess);
      }

      credit.status = statusFor(credit.amount_paid, netTotal);
      credit.updated_at = new Date();

      await ret.save({ session });
      await credit.save({ session });

      await moveStock({
        shop: ctx.shop,
        item_name: lineItem.item_name,
        delta: returnQty,
        reason: 'sales_return',
        ref_model: 'CreditReturn',
        ref_id: ret._id,
        cost_per_unit: lineItem.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        allowNegative: true,
        session,
      });

      return ret;
    });

    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

// Undo a credit return: the goods leave stock again and any refund is reversed.
router.delete('/:id/return/:returnId', async (req, res) => {
  try {
    const ret = await CreditReturn.findOne({
      _id: req.params.returnId,
      credit_id: req.params.id,
      shop: req.shopId,
    });
    const credit = await Credit.findOne({ _id: req.params.id, shop: req.shopId });
    if (!ret || !credit) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (ret.voided_at) {
      return res.status(400).json({ error: 'This return is already cancelled' });
    }

    const allowNegative = req.body?.allow_negative === true;
    const shortfalls = await findShortfalls(req.shopId, [
      { item_name: ret.item_name, quantity: ret.quantity },
    ]);
    if (shortfalls.length > 0 && !allowNegative) {
      return res.status(409).json({
        error: 'stock_would_go_negative',
        message: describeShortfalls(shortfalls),
        shortfalls,
        confirmable: true,
      });
    }

    const ctx = writeContext(req);

    const voided = await runInTransaction(async (session) => {
      await moveStock({
        shop: req.shopId,
        item_name: ret.item_name,
        delta: -ret.quantity,
        reason: 'void',
        ref_model: 'CreditReturn',
        ref_id: ret._id,
        cost_per_unit: ret.cost_per_unit,
        date: ctx.date,
        date_key: ctx.date_key,
        note: 'credit return cancelled',
        allowNegative: true,
        session,
      });

      if (ret.refund_payment_id) {
        const refund = await CreditPayment.findById(ret.refund_payment_id).session(session || null);
        if (refund && !refund.voided_at) {
          refund.voided_at = ctx.date;
          refund.voided_by = ctx.username;
          await refund.save({ session });
          credit.amount_paid = round2(credit.amount_paid - refund.amount); // refund.amount is negative
        }
      }

      credit.returned_amount = round2(Math.max((credit.returned_amount || 0) - ret.refund_amount, 0));
      credit.status = statusFor(credit.amount_paid, round2(credit.total_amount - credit.returned_amount));
      credit.updated_at = new Date();
      await credit.save({ session });

      ret.voided_at = ctx.date;
      ret.voided_by = ctx.username;
      await ret.save({ session });
      return ret;
    });

    res.json({ cancelled: true, return: voided });
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

    if ((credit.returned_amount || 0) > 0) {
      return res.status(400).json({
        error: 'This credit has returns recorded against it. Cancel the returns first, then edit it.',
      });
    }

    const ctx = writeContext(req, req.body.date || credit.date);
    const originalLines = credit.items.map((l) => l.toObject());
    const lines = await resolveLines(req.shopId, req.body.items, originalLines);
    for (const line of lines) await assertStockedBy(req.shopId, line.item_name, ctx.date_key);
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
    if (credit.amount_paid > 0 || (credit.returned_amount || 0) > 0) {
      return res.status(400).json({
        error:
          `Cannot cancel this credit: ${credit.amount_paid} has already been collected` +
          `${(credit.returned_amount || 0) > 0 ? ' and goods have been returned' : ''}. ` +
          'If the goods came back, use Return on this credit instead.',
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
