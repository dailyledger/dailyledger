const express = require('express');
const router = express.Router();
const { todayKey, keysBack, isDateKey } = require('../utils/shopDay');
const { sendError } = require('../utils/ledger');
const { summarizeByShop, outstandingCreditByShop, emptyTotals } = require('../utils/summary');

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

    // Blocker 02/03: the totals are computed by the database in utils/summary.js,
    // shared with the admin console so both always agree.
    const [byShop, outstanding] = await Promise.all([
      summarizeByShop(match),
      outstandingCreditByShop({ shop: req.shopId }),
    ]);
    const shopKey = String(req.shopId);
    const totals = byShop.get(shopKey) || emptyTotals();

    res.json({
      period: req.query.period || 'day',
      from: keys[keys.length - 1],
      to: keys[0],
      timezone: req.shop.timezone,

      total_sales: totals.total_sales,
      total_credit_sales: totals.total_credit_sales,
      total_refunds: totals.total_refunds,
      credit_collected: totals.credit_collected,
      money_received: totals.money_received,
      revenue: totals.revenue,

      cost_of_goods_sold: totals.cost_of_goods_sold,
      gross_profit: totals.gross_profit,
      total_spoilage: totals.total_spoilage,
      net_profit: totals.net_profit,

      total_purchases: totals.total_purchases,
      cash_flow: totals.cash_flow,

      total_outstanding_credit: outstanding.get(shopKey) || 0,
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
