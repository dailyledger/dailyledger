const express = require('express');
const router = express.Router();

const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const Sale = require('../models/Sale');
const Credit = require('../models/Credit');
const CreditPayment = require('../models/CreditPayment');
const Spoilage = require('../models/Spoilage');
const Item = require('../models/Item');
const EventSettings = require('../models/EventSettings');
const { round2 } = require('../utils/money');
const { sendError } = require('../utils/ledger');
const { BadRequestError } = require('../utils/dateFilter');
const { isDateKey, todayKey, DEFAULT_TIMEZONE } = require('../utils/shopDay');
const { summarizeByShop, sumTotals, emptyTotals } = require('../utils/summary');
const {
  cleanText,
  dateCondition,
  previousDateCondition,
  selectedShops,
} = require('../utils/adminFilters');
const {
  sliceMatch,
  countByShop,
  topItems,
  stockSnapshot,
  sumStock,
  sliceMetrics,
  perStallMetrics,
  wastePct,
} = require('../utils/adminMetrics');

/*
 * Admin section endpoints (Sales, Purchases, Inventory, Credit & Wastage), the compare
 * engine and event settings. Mounted under /api/admin behind requireAdmin.
 */

const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);
const shopNames = (shops) => new Map(shops.map((s) => [String(s._id), s.name]));

// ------------------------------------------------------------------- sales

router.get('/sales/overview', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const ids = shops.map((s) => s._id);
    const dates = dateCondition(req.query);
    const before = previousDateCondition(req.query);
    const match = sliceMatch(ids, dates);

    const [current, previous, stalls, salePay, creditSales] = await Promise.all([
      sliceMetrics(shops, dates),
      before ? sliceMetrics(shops, before) : null,
      perStallMetrics(shops, dates),
      Sale.aggregate([{ $match: match }, { $group: { _id: '$payment_mode', total: { $sum: '$total_amount' } } }]),
      Credit.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$total_amount' } } }]),
    ]);

    const payment = (mode) => round2(salePay.find((p) => p._id === mode)?.total || 0);
    const total = current.metrics.revenue;

    res.json({
      totals: current.metrics,
      previous: previous && {
        revenue: previous.metrics.revenue,
        orders: previous.metrics.orders,
        avg_order: previous.metrics.avg_order,
        units_sold: previous.metrics.units_sold,
      },
      trend: current.trend,
      top_items: await topItems(match, 8),
      by_payment: { cash: payment('cash'), gpay: payment('gpay'), credit: round2(creditSales[0]?.total || 0) },
      by_stall: stalls
        .map((s) => ({ ...s, share_pct: pct(s.revenue, total) }))
        .sort((a, b) => b.revenue - a.revenue),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --------------------------------------------------------------- purchases

const UNIT_COST = {
  $divide: [
    '$amount',
    { $multiply: ['$quantity', { $cond: [{ $gt: ['$units_per_pack', 1] }, '$units_per_pack', 1] }] },
  ],
};

async function purchaseFigures(shops, dates) {
  const ids = shops.map((s) => s._id);
  const match = sliceMatch(ids, dates);
  const [byShop, counts] = await Promise.all([summarizeByShop(match), countByShop(Purchase, match)]);
  const totals = sumTotals([...byShop.values()]);
  const count = [...counts.values()].reduce((sum, v) => sum + v, 0);
  return { byShop, counts, spent: totals.total_purchases, revenue: totals.revenue, count };
}

router.get('/purchases/overview', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const ids = shops.map((s) => s._id);
    const names = shopNames(shops);
    const dates = dateCondition(req.query);
    const before = previousDateCondition(req.query);
    const match = sliceMatch(ids, dates);

    const [now, prev, returns, spendByDay, returnsByDay, vendors, byItem, price, kinds] = await Promise.all([
      purchaseFigures(shops, dates),
      before ? purchaseFigures(shops, before) : null,
      PurchaseReturn.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$refund_amount' } } }]),
      Purchase.aggregate([{ $match: match }, { $group: { _id: '$date_key', spent: { $sum: '$amount' } } }]),
      PurchaseReturn.aggregate([{ $match: match }, { $group: { _id: '$date_key', spent: { $sum: '$refund_amount' } } }]),
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: { $toLower: '$vendor_name' }, name: { $first: '$vendor_name' }, spent: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { spent: -1 } },
        { $limit: 8 },
      ]),
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: { shop: '$shop', item: { $toLower: '$item_name' } }, name: { $first: '$item_name' }, spent: { $sum: '$amount' } } },
      ]),
      Purchase.aggregate([
        { $match: match },
        { $sort: { date: 1 } },
        {
          $group: {
            _id: { shop: '$shop', item: { $toLower: '$item_name' } },
            name: { $first: '$item_name' },
            first: { $first: UNIT_COST },
            last: { $last: UNIT_COST },
            n: { $sum: 1 },
          },
        },
        { $match: { n: { $gte: 2 } } },
      ]),
      Item.find({ shop: { $in: ids } }).select('shop item_name kind').lean(),
    ]);

    // Raw material vs resale: purchases only know the item's name, the item knows its kind.
    const kindOf = new Map(kinds.map((i) => [`${i.shop}|${i.item_name.toLowerCase()}`, i.kind || 'resale']));
    const byKind = { resale: 0, raw: 0 };
    const itemTotals = new Map();
    for (const row of byItem) {
      const kind = kindOf.get(`${row._id.shop}|${row._id.item}`) || 'resale';
      byKind[kind === 'raw' ? 'raw' : 'resale'] += row.spent;
      const entry = itemTotals.get(row._id.item) || { name: row.name, spent: 0 };
      entry.spent += row.spent;
      itemTotals.set(row._id.item, entry);
    }

    const days = new Map();
    spendByDay.forEach((r) => days.set(r._id, (days.get(r._id) || 0) + r.spent));
    returnsByDay.forEach((r) => days.set(r._id, (days.get(r._id) || 0) - r.spent));

    const priceWatch = price
      .map((p) => ({
        name: p.name,
        stall: names.get(String(p._id.shop)) || 'Unknown',
        first: round2(p.first),
        last: round2(p.last),
        change_pct: p.first > 0 ? round2(((p.last - p.first) / p.first) * 100) : 0,
      }))
      .filter((p) => Math.abs(p.change_pct) >= 5)
      .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
      .slice(0, 8);

    res.json({
      totals: {
        spent: now.spent,
        count: now.count,
        avg_purchase: now.count ? round2(now.spent / now.count) : 0,
        returns: round2(returns[0]?.total || 0),
        spend_pct_of_revenue: pct(now.spent, now.revenue),
      },
      previous: prev && { spent: prev.spent, count: prev.count },
      by_kind: { resale: round2(byKind.resale), raw: round2(byKind.raw) },
      trend: [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, spent]) => ({ date, spent: round2(spent) })),
      by_stall: shops
        .map((shop) => {
          const key = String(shop._id);
          const t = now.byShop.get(key) || emptyTotals();
          return {
            id: shop._id,
            name: shop.name,
            spent: t.total_purchases,
            count: now.counts.get(key) || 0,
            spend_pct_of_revenue: pct(t.total_purchases, t.revenue),
            share_pct: pct(t.total_purchases, now.spent),
          };
        })
        .sort((a, b) => b.spent - a.spent),
      top_vendors: vendors.map((v) => ({ name: v.name, spent: round2(v.spent), count: v.count })),
      top_items: [...itemTotals.values()].sort((a, b) => b.spent - a.spent).slice(0, 8).map((i) => ({ name: i.name, spent: round2(i.spent) })),
      price_watch: priceWatch,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// --------------------------------------------------------------- inventory

router.get('/inventory/overview', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const ids = shops.map((s) => s._id);
    const names = shopNames(shops);
    const dates = dateCondition(req.query);
    const match = sliceMatch(ids, dates);

    const [snapshot, byShop, reasons] = await Promise.all([
      stockSnapshot(ids),
      summarizeByShop(match),
      Spoilage.aggregate([{ $match: match }, { $group: { _id: '$reason', value: { $sum: '$estimated_value' } } }]),
    ]);

    const stock = sumStock(snapshot, ids);
    const wastage = sumTotals([...byShop.values()]);
    const order = { negative: 0, out: 1, low: 2 };

    res.json({
      totals: {
        ...stock,
        wastage_value: wastage.total_spoilage,
        waste_pct: wastePct(wastage.total_spoilage, wastage.total_purchases),
      },
      wastage_by_reason: {
        expired: round2(reasons.find((r) => r._id === 'expired')?.value || 0),
        damaged: round2(reasons.find((r) => r._id === 'damaged')?.value || 0),
      },
      by_stall: shops
        .map((shop) => {
          const key = String(shop._id);
          const e = snapshot.byShop.get(key) || { items: 0, stock_value: 0, low: 0, out: 0, negative: 0 };
          const t = byShop.get(key) || emptyTotals();
          return {
            id: shop._id,
            name: shop.name,
            items: e.items,
            stock_value: round2(e.stock_value),
            low: e.low,
            out: e.out,
            negative: e.negative,
            wastage_value: t.total_spoilage,
            waste_pct: wastePct(t.total_spoilage, t.total_purchases),
          };
        })
        .sort((a, b) => b.stock_value - a.stock_value),
      attention: snapshot.attention
        .map((a) => ({ ...a, stall: names.get(a.shop) || 'Unknown' }))
        .sort((a, b) => order[a.status] - order[b.status] || a.item.localeCompare(b.item))
        .slice(0, 80),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------- credit & wastage

const AGE_BUCKETS = [
  { key: '0-7', label: '0 to 7 days', max: 7 },
  { key: '8-14', label: '8 to 14 days', max: 14 },
  { key: '15-30', label: '15 to 30 days', max: 30 },
  { key: '30+', label: 'Over 30 days', max: Infinity },
];

router.get('/credit-wastage', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const ids = shops.map((s) => s._id);
    const names = shopNames(shops);
    const dates = dateCondition(req.query);
    const match = sliceMatch(ids, dates);
    const today = new Date(`${todayKey(DEFAULT_TIMEZONE, 0)}T00:00:00.000Z`);

    const [open, collected, byShop, reasons, items, byDay] = await Promise.all([
      Credit.find({ shop: { $in: ids }, voided_at: null, status: { $ne: 'paid' } })
        .select('shop customer_name total_amount returned_amount amount_paid date_key')
        .lean(),
      CreditPayment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      summarizeByShop(match),
      Spoilage.aggregate([{ $match: match }, { $group: { _id: '$reason', value: { $sum: '$estimated_value' } } }]),
      Spoilage.aggregate([
        { $match: match },
        { $group: { _id: { $toLower: '$item_name' }, name: { $first: '$item_name' }, quantity: { $sum: '$quantity' }, value: { $sum: '$estimated_value' } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]),
      Spoilage.aggregate([{ $match: match }, { $group: { _id: '$date_key', value: { $sum: '$estimated_value' } } }, { $sort: { _id: 1 } }]),
    ]);

    const owing = [];
    const ageing = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, amount: 0, count: 0 }));
    const stallOwed = new Map();
    const debtors = new Map();

    for (const credit of open) {
      const balance = round2(credit.total_amount - (credit.returned_amount || 0) - credit.amount_paid);
      if (balance <= 0) continue;
      const days = Math.max(0, Math.round((today - new Date(`${credit.date_key}T00:00:00.000Z`)) / 864e5));
      const bucket = ageing[AGE_BUCKETS.findIndex((b) => days <= b.max)];
      bucket.amount += balance;
      bucket.count += 1;
      stallOwed.set(String(credit.shop), (stallOwed.get(String(credit.shop)) || 0) + balance);

      const key = `${credit.shop}|${credit.customer_name.trim().toLowerCase()}`;
      const d = debtors.get(key) || { customer: credit.customer_name, stall: names.get(String(credit.shop)) || 'Unknown', balance: 0, oldest_days: 0 };
      d.balance += balance;
      d.oldest_days = Math.max(d.oldest_days, days);
      debtors.set(key, d);
      owing.push(balance);
    }

    const wastage = sumTotals([...byShop.values()]);

    res.json({
      credit: {
        outstanding: round2(owing.reduce((sum, v) => sum + v, 0)),
        open_count: owing.length,
        collected: round2(collected[0]?.total || 0),
        ageing: ageing.map((a) => ({ ...a, amount: round2(a.amount) })),
        by_stall: shops
          .map((s) => ({ id: s._id, name: s.name, outstanding: round2(stallOwed.get(String(s._id)) || 0) }))
          .filter((s) => s.outstanding > 0)
          .sort((a, b) => b.outstanding - a.outstanding),
        top_debtors: [...debtors.values()]
          .map((d) => ({ ...d, balance: round2(d.balance) }))
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 8),
      },
      wastage: {
        total: wastage.total_spoilage,
        waste_pct: wastePct(wastage.total_spoilage, wastage.total_purchases),
        by_reason: {
          expired: round2(reasons.find((r) => r._id === 'expired')?.value || 0),
          damaged: round2(reasons.find((r) => r._id === 'damaged')?.value || 0),
        },
        by_stall: shops
          .map((shop) => {
            const t = byShop.get(String(shop._id)) || emptyTotals();
            return { id: shop._id, name: shop.name, value: t.total_spoilage, waste_pct: wastePct(t.total_spoilage, t.total_purchases) };
          })
          .filter((s) => s.value > 0)
          .sort((a, b) => b.value - a.value),
        top_items: items.map((i) => ({ name: i.name, quantity: round2(i.quantity), value: round2(i.value) })),
        trend: byDay.map((d) => ({ date: d._id, value: round2(d.value) })),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ----------------------------------------------------------------- compare

/** One side of a comparison: a group of stalls over a date range. */
async function readSlice(prefix, query) {
  const from = query[`${prefix}_from`];
  const to = query[`${prefix}_to`];
  if (from && !isDateKey(from)) throw new BadRequestError('Dates must be YYYY-MM-DD');
  if (to && !isDateKey(to)) throw new BadRequestError('Dates must be YYYY-MM-DD');
  if (from && to && from > to) throw new BadRequestError('A start date cannot be after its end date');

  const shops = await selectedShops({ stalls: query[`${prefix}_stalls`] });
  const dates = from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : null;
  const result = await sliceMetrics(shops, dates);

  const named = shops.length > 3 ? `${shops.slice(0, 2).map((s) => s.name).join(', ')} +${shops.length - 2} more` : shops.map((s) => s.name).join(', ');
  const all = !query[`${prefix}_stalls`];
  return {
    stall_label: all ? 'All stalls' : named || 'No stalls',
    range_label: from || to ? `${from || 'start'} to ${to || 'today'}` : 'All time',
    ...result,
  };
}

/*
 * Compare any two slices: stall vs stall (same dates), period vs period (same stalls), or
 * both at once. The page decides what to vary; this just computes each side.
 */
router.get('/compare', async (req, res) => {
  try {
    const [a, b] = await Promise.all([readSlice('a', req.query), readSlice('b', req.query)]);
    res.json({ a, b });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------- settings

async function readSettings() {
  const doc = await EventSettings.findOne({ key: 'event' }).lean();
  return { name: doc?.name || '', tagline: doc?.tagline || '', day1: doc?.day1 || '' };
}

router.get('/settings', async (req, res) => {
  try {
    res.json(await readSettings());
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/settings', async (req, res) => {
  try {
    const name = cleanText(req.body.name, 60);
    const tagline = cleanText(req.body.tagline, 120);
    const day1 = cleanText(req.body.day1, 10);
    if (day1 && !isDateKey(day1)) throw new BadRequestError('Day 1 must be a date (YYYY-MM-DD)');

    await EventSettings.findOneAndUpdate(
      { key: 'event' },
      { key: 'event', name, tagline, day1, updated_at: new Date() },
      { upsert: true, new: true }
    );
    res.json({ name, tagline, day1 });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
module.exports.readSettings = readSettings;
