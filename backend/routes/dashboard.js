const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Spoilage = require('../models/Spoilage');
const Credit = require('../models/Credit');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const { round2 } = require('../utils/money');
const { todayKey, keysBack, isDateKey } = require('../utils/shopDay');
const { sendError } = require('../utils/ledger');

/**
 * Blocker 05: the period is expressed in the shop's own business days.
 * Blocker 03/B3: every total is computed by the database with $group rather than
 * by loading documents into Node and reducing them — Render's free tier only has
 * 512MB of RAM, and a year of sales does not belong in it.
 */
function periodKeys(req) {
  const { timezone, day_start_hour: dayStart } = req.shop;

  if (isDateKey(req.query.date)) {
    return [req.query.date];
  }

  switch (req.query.period) {
    case 'week':
      return keysBack(7, timezone, dayStart);
    case 'month':
      return keysBack(30, timezone, dayStart);
    default:
      return [todayKey(timezone, dayStart)];
  }
}

router.get('/summary', async (req, res) => {
  try {
    const keys = periodKeys(req);
    const match = { shop: req.shopId, date_key: { $in: keys }, voided_at: null };

    const [
      salesAgg,
      purchaseAgg,
      purchaseReturnAgg,
      spoilageAgg,
      returnAgg,
      creditAgg,
      outstandingAgg,
    ] = await Promise.all([
        // Blocker 02: revenue and cost of goods sold come from the same documents,
        // using the cost frozen on each line at the time of sale.
        Sale.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: null,
              revenue: { $sum: '$items.line_total' },
              cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
            },
          },
        ]),
        Purchase.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Stock sent back to the vendor was never really bought, so it must come
        // off the purchase total.
        PurchaseReturn.aggregate([
          { $match: match },
          { $group: { _id: null, refunds: { $sum: '$refund_amount' } } },
        ]),
        Spoilage.aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: '$estimated_value' } } },
        ]),
        SalesReturn.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              refunds: { $sum: '$refund_amount' },
              cost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
            },
          },
        ]),
        // Goods given on credit are also sold goods: their margin belongs in profit
        // even though the cash has not arrived yet.
        Credit.aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: null,
              revenue: { $sum: '$items.line_total' },
              cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
            },
          },
        ]),
        // Outstanding credit is a running balance, not a period figure, so it is
        // not filtered by date.
        Credit.aggregate([
          { $match: { shop: req.shopId, voided_at: null, status: { $ne: 'paid' } } },
          {
            $group: {
              _id: null,
              total: { $sum: { $subtract: ['$total_amount', '$amount_paid'] } },
            },
          },
        ]),
      ]);

    const first = (rows, field) => (rows.length ? rows[0][field] || 0 : 0);

    const sales_revenue = round2(first(salesAgg, 'revenue'));
    const sales_cogs = round2(first(salesAgg, 'cogs'));
    const credit_revenue = round2(first(creditAgg, 'revenue'));
    const credit_cogs = round2(first(creditAgg, 'cogs'));
    const refunds = round2(first(returnAgg, 'refunds'));
    const refund_cost = round2(first(returnAgg, 'cost'));
    const purchase_refunds = round2(first(purchaseReturnAgg, 'refunds'));
    const total_purchases = round2(first(purchaseAgg, 'total') - purchase_refunds);
    const total_spoilage = round2(first(spoilageAgg, 'total'));

    const revenue = round2(sales_revenue + credit_revenue - refunds);
    const cost_of_goods_sold = round2(sales_cogs + credit_cogs - refund_cost);

    /*
     * Blocker 02: profit is margin, not cash flow.
     *
     * The old formula was `sales - purchases - spoilage`, which treats stock
     * bought as money lost. Buying 100kg of rice and selling 8kg of it showed a
     * catastrophic loss on the day of the purchase and pure profit afterwards.
     *
     * Gross profit is what the goods sold for minus what those same goods cost.
     * Purchases only affect profit once the stock actually sells.
     */
    const gross_profit = round2(revenue - cost_of_goods_sold);
    const net_profit = round2(gross_profit - total_spoilage);

    res.json({
      period: req.query.period || 'day',
      from: keys[keys.length - 1],
      to: keys[0],
      timezone: req.shop.timezone,

      total_sales: sales_revenue,
      total_credit_sales: credit_revenue,
      total_refunds: refunds,
      revenue,

      cost_of_goods_sold,
      gross_profit,
      total_spoilage,
      net_profit,

      // Kept for the cash view: what actually left the till for stock today.
      total_purchases,
      cash_flow: round2(revenue - total_purchases),

      total_outstanding_credit: round2(first(outstandingAgg, 'total')),
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
