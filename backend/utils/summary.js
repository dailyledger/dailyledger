const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Spoilage = require('../models/Spoilage');
const Credit = require('../models/Credit');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const { round2 } = require('./money');

/**
 * Profit math shared by the stall dashboard and the admin console, so both always
 * agree to the paisa.
 *
 * `match` is a ready-made $match (shop filter + date filter + voided_at: null).
 * Every figure is computed by the database with $group, grouped per shop, so one
 * pass serves a single stall (dashboard) or all of them (admin overview).
 *
 * Blocker 02: profit is margin, not cash flow. Revenue and cost of goods sold come
 * from the same documents, using the cost frozen on each line at the time of sale.
 */
const LINE_TOTALS = {
  _id: '$shop',
  revenue: { $sum: '$items.line_total' },
  cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
};

function emptyTotals() {
  return {
    total_sales: 0,
    total_credit_sales: 0,
    total_refunds: 0,
    revenue: 0,
    cost_of_goods_sold: 0,
    gross_profit: 0,
    total_spoilage: 0,
    net_profit: 0,
    total_purchases: 0,
    cash_flow: 0,
  };
}

async function summarizeByShop(match) {
  const [salesAgg, purchaseAgg, purchaseReturnAgg, spoilageAgg, returnAgg, creditAgg] =
    await Promise.all([
      Sale.aggregate([{ $match: match }, { $unwind: '$items' }, { $group: LINE_TOTALS }]),
      Purchase.aggregate([{ $match: match }, { $group: { _id: '$shop', total: { $sum: '$amount' } } }]),
      // Stock sent back to the vendor was never really bought, so it comes off the
      // purchase total.
      PurchaseReturn.aggregate([
        { $match: match },
        { $group: { _id: '$shop', refunds: { $sum: '$refund_amount' } } },
      ]),
      Spoilage.aggregate([
        { $match: match },
        { $group: { _id: '$shop', total: { $sum: '$estimated_value' } } },
      ]),
      SalesReturn.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$shop',
            refunds: { $sum: '$refund_amount' },
            cost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
          },
        },
      ]),
      // Goods given on credit are also sold goods: their margin belongs in profit
      // even though the cash has not arrived yet.
      Credit.aggregate([{ $match: match }, { $unwind: '$items' }, { $group: LINE_TOTALS }]),
    ]);

  const index = (rows) => new Map(rows.map((row) => [String(row._id), row]));
  const sales = index(salesAgg);
  const purchases = index(purchaseAgg);
  const purchaseReturns = index(purchaseReturnAgg);
  const spoilage = index(spoilageAgg);
  const returns = index(returnAgg);
  const credits = index(creditAgg);

  const shopIds = new Set([
    ...sales.keys(),
    ...purchases.keys(),
    ...purchaseReturns.keys(),
    ...spoilage.keys(),
    ...returns.keys(),
    ...credits.keys(),
  ]);

  const result = new Map();
  for (const id of shopIds) {
    const pick = (map, field) => (map.get(id) ? map.get(id)[field] || 0 : 0);

    const sales_revenue = round2(pick(sales, 'revenue'));
    const sales_cogs = round2(pick(sales, 'cogs'));
    const credit_revenue = round2(pick(credits, 'revenue'));
    const credit_cogs = round2(pick(credits, 'cogs'));
    const refunds = round2(pick(returns, 'refunds'));
    const refund_cost = round2(pick(returns, 'cost'));
    const purchase_refunds = round2(pick(purchaseReturns, 'refunds'));
    const total_purchases = round2(pick(purchases, 'total') - purchase_refunds);
    const total_spoilage = round2(pick(spoilage, 'total'));

    const revenue = round2(sales_revenue + credit_revenue - refunds);
    const cost_of_goods_sold = round2(sales_cogs + credit_cogs - refund_cost);

    // Gross profit is what the goods sold for minus what those same goods cost.
    // Purchases only affect profit once the stock actually sells.
    const gross_profit = round2(revenue - cost_of_goods_sold);
    const net_profit = round2(gross_profit - total_spoilage);

    result.set(id, {
      total_sales: sales_revenue,
      total_credit_sales: credit_revenue,
      total_refunds: refunds,
      revenue,
      cost_of_goods_sold,
      gross_profit,
      total_spoilage,
      net_profit,
      // Kept for the cash view: what actually left the till for stock.
      total_purchases,
      cash_flow: round2(revenue - total_purchases),
    });
  }

  return result;
}

/**
 * Outstanding credit is a running balance, not a period figure, so it is not
 * filtered by date. `shopFilter` is a ready-made condition on `shop`.
 */
async function outstandingCreditByShop(shopFilter = {}) {
  const rows = await Credit.aggregate([
    { $match: { ...shopFilter, voided_at: null, status: { $ne: 'paid' } } },
    {
      $group: {
        _id: '$shop',
        total: { $sum: { $subtract: ['$total_amount', '$amount_paid'] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), round2(row.total || 0)]));
}

/** Add several stalls' totals together (used for the all-stalls headline). */
function sumTotals(list) {
  const total = emptyTotals();
  for (const t of list) {
    for (const key of Object.keys(total)) {
      total[key] = round2(total[key] + (t[key] || 0));
    }
  }
  return total;
}

module.exports = { summarizeByShop, outstandingCreditByShop, sumTotals, emptyTotals };
