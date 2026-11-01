const Sale = require('../models/Sale');
const Credit = require('../models/Credit');
const SalesReturn = require('../models/SalesReturn');
const CreditReturn = require('../models/CreditReturn');
const Item = require('../models/Item');
const { round2 } = require('./money');
const { marginPct } = require('./adminFilters');
const { summarizeByShop, outstandingCreditByShop, sumTotals, emptyTotals } = require('./summary');

/*
 * Numbers behind the admin sections, leaderboard and compare tool. Everything goes
 * through summarizeByShop (utils/summary.js), the same profit math as the stall
 * dashboard, so no screen can disagree with another.
 */

const LOW_STOCK = 5;

/** Ledger match for some stalls over a date_key window (null = all time). */
function sliceMatch(shopIds, dates, extra = {}) {
  const match = { shop: { $in: shopIds }, voided_at: null, ...extra };
  if (dates) match.date_key = dates;
  return match;
}

const mapOf = (rows, field) => new Map(rows.map((r) => [String(r._id), r[field] || 0]));
const sumMaps = (...maps) => {
  const out = new Map();
  maps.forEach(([map, sign]) => {
    map.forEach((value, key) => out.set(key, (out.get(key) || 0) + sign * value));
  });
  return out;
};

async function countByShop(Model, match) {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: '$shop', n: { $sum: 1 } } }]);
  return mapOf(rows, 'n');
}

/** Units sold per stall: cash + credit sales, less goods brought back. */
async function unitsByShop(match) {
  const lines = (Model) =>
    Model.aggregate([{ $match: match }, { $unwind: '$items' }, { $group: { _id: '$shop', q: { $sum: '$items.quantity' } } }]);
  const returned = (Model) => Model.aggregate([{ $match: match }, { $group: { _id: '$shop', q: { $sum: '$quantity' } } }]);
  const [s, c, rs, rc] = await Promise.all([lines(Sale), lines(Credit), returned(SalesReturn), returned(CreditReturn)]);
  return sumMaps([mapOf(s, 'q'), 1], [mapOf(c, 'q'), 1], [mapOf(rs, 'q'), -1], [mapOf(rc, 'q'), -1]);
}

/** Revenue, cost and orders per day (cash + credit sales, less returns). */
async function dailySeries(match) {
  const lines = (Model) =>
    Model.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$date_key',
          revenue: { $sum: '$items.line_total' },
          cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
        },
      },
    ]);
  const orders = (Model) => Model.aggregate([{ $match: match }, { $group: { _id: '$date_key', n: { $sum: 1 } } }]);
  const returns = (Model) =>
    Model.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$date_key',
          revenue: { $sum: '$refund_amount' },
          cogs: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
        },
      },
    ]);

  const [sl, cl, so, co, rs, rc] = await Promise.all([
    lines(Sale), lines(Credit), orders(Sale), orders(Credit), returns(SalesReturn), returns(CreditReturn),
  ]);

  const days = new Map();
  const bump = (key, field, value) => {
    const entry = days.get(key) || { date: key, revenue: 0, cogs: 0, orders: 0 };
    entry[field] += value;
    days.set(key, entry);
  };
  [sl, cl].flat().forEach((r) => { bump(r._id, 'revenue', r.revenue); bump(r._id, 'cogs', r.cogs); });
  [so, co].flat().forEach((r) => bump(r._id, 'orders', r.n));
  [rs, rc].flat().forEach((r) => { bump(r._id, 'revenue', -r.revenue); bump(r._id, 'cogs', -r.cogs); });

  return [...days.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ date: d.date, revenue: round2(d.revenue), profit: round2(d.revenue - d.cogs), orders: d.orders }));
}

/** Best sellers by revenue, net of returns. */
async function topItems(match, limit = 5) {
  const lines = (Model) =>
    Model.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $toLower: '$items.item_name' },
          name: { $first: '$items.item_name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.line_total' },
          cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
        },
      },
    ]);
  const returns = (Model) =>
    Model.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $toLower: '$item_name' },
          quantity: { $sum: '$quantity' },
          revenue: { $sum: '$refund_amount' },
          cogs: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
        },
      },
    ]);
  const [s, c, rs, rc] = await Promise.all([lines(Sale), lines(Credit), returns(SalesReturn), returns(CreditReturn)]);

  const map = new Map();
  const add = (row, sign) => {
    const e = map.get(row._id) || { name: row.name, quantity: 0, revenue: 0, cogs: 0 };
    e.name = e.name || row.name;
    e.quantity += sign * row.quantity;
    e.revenue += sign * row.revenue;
    e.cogs += sign * row.cogs;
    map.set(row._id, e);
  };
  [...s, ...c].forEach((r) => add(r, 1));
  [...rs, ...rc].forEach((r) => add(r, -1));

  return [...map.entries()]
    .map(([key, e]) => ({ name: e.name || key, quantity: round2(e.quantity), revenue: round2(e.revenue), profit: round2(e.revenue - e.cogs) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** What is on the shelves right now, per stall (not tied to a period). */
async function stockSnapshot(shopIds) {
  const items = await Item.find({ shop: { $in: shopIds } }).lean();
  const byShop = new Map();
  const attention = [];

  for (const item of items) {
    const key = String(item.shop);
    const entry = byShop.get(key) || {
      items: 0, stock_value: 0, low: 0, out: 0, negative: 0, by_kind: { resale: 0, raw: 0, cooked: 0 },
    };
    const stock = item.stock_quantity || 0;
    const value = Math.max(item.inventory_value ?? Math.max(stock, 0) * (item.last_cost_price || 0), 0);
    const kind = item.kind || 'resale';

    entry.items += 1;
    entry.stock_value += value;
    entry.by_kind[kind] = (entry.by_kind[kind] || 0) + value;

    let status = null;
    if (stock < 0) { entry.negative += 1; status = 'negative'; }
    else if (stock === 0) { entry.out += 1; status = 'out'; }
    else if (stock <= LOW_STOCK) { entry.low += 1; status = 'low'; }
    if (status) {
      attention.push({ shop: key, item: item.item_name, kind, quantity: stock, unit: item.unit_type, status });
    }
    byShop.set(key, entry);
  }
  return { byShop, attention };
}

/** Aggregate stock figures over several stalls. */
function sumStock(snapshot, shopIds) {
  const out = { items: 0, stock_value: 0, low: 0, out: 0, negative: 0, by_kind: { resale: 0, raw: 0, cooked: 0 } };
  for (const id of shopIds) {
    const e = snapshot.byShop.get(String(id));
    if (!e) continue;
    out.items += e.items; out.stock_value += e.stock_value; out.low += e.low; out.out += e.out; out.negative += e.negative;
    for (const k of Object.keys(out.by_kind)) out.by_kind[k] += e.by_kind[k] || 0;
  }
  out.stock_value = round2(out.stock_value);
  for (const k of Object.keys(out.by_kind)) out.by_kind[k] = round2(out.by_kind[k]);
  return out;
}

const wastePct = (spoilage, purchases) => (purchases > 0 ? round2((spoilage / purchases) * 100) : 0);

/**
 * Every metric the compare tool, sections and scorecards show, for a group of stalls over
 * a date window.
 */
async function sliceMetrics(shops, dates) {
  const ids = shops.map((s) => s._id);
  const match = sliceMatch(ids, dates);
  const [byShop, outstanding, sales, credits, units, daily, items, snapshot] = await Promise.all([
    summarizeByShop(match),
    outstandingCreditByShop({ shop: { $in: ids } }),
    Sale.countDocuments(match),
    Credit.countDocuments(match),
    unitsByShop(match),
    dailySeries(match),
    topItems(match, 5),
    stockSnapshot(ids),
  ]);

  const totals = sumTotals([...byShop.values()]);
  const orders = sales + credits;
  const stock = sumStock(snapshot, ids);
  const owed = round2([...outstanding.values()].reduce((sum, v) => sum + v, 0));

  return {
    metrics: {
      revenue: totals.revenue,
      orders,
      avg_order: orders ? round2(totals.revenue / orders) : 0,
      units_sold: round2([...units.values()].reduce((sum, v) => sum + v, 0)),
      gross_profit: totals.gross_profit,
      net_profit: totals.net_profit,
      margin_pct: marginPct(totals.net_profit, totals.revenue),
      spoilage: totals.total_spoilage,
      purchases: totals.total_purchases,
      waste_pct: wastePct(totals.total_spoilage, totals.total_purchases),
      money_received: totals.money_received,
      credit_outstanding: owed,
      stock_value: stock.stock_value,
      low_stock: stock.low,
      out_of_stock: stock.out,
    },
    trend: daily,
    top_items: items,
    stock,
  };
}

/** One row of numbers per stall over a date window. */
async function perStallMetrics(shops, dates) {
  const ids = shops.map((s) => s._id);
  const match = sliceMatch(ids, dates);
  const [byShop, outstanding, sales, credits, units] = await Promise.all([
    summarizeByShop(match),
    outstandingCreditByShop({ shop: { $in: ids } }),
    countByShop(Sale, match),
    countByShop(Credit, match),
    unitsByShop(match),
  ]);

  return shops.map((shop) => {
    const key = String(shop._id);
    const t = byShop.get(key) || emptyTotals();
    const orders = (sales.get(key) || 0) + (credits.get(key) || 0);
    return {
      id: shop._id,
      name: shop.name,
      active: shop.active !== false,
      revenue: t.revenue,
      net_profit: t.net_profit,
      gross_profit: t.gross_profit,
      margin_pct: marginPct(t.net_profit, t.revenue),
      spoilage: t.total_spoilage,
      purchases: t.total_purchases,
      waste_pct: wastePct(t.total_spoilage, t.total_purchases),
      orders,
      avg_order: orders ? round2(t.revenue / orders) : 0,
      units_sold: round2(units.get(key) || 0),
      money_received: t.money_received,
      credit_outstanding: outstanding.get(key) || 0,
    };
  });
}

module.exports = {
  LOW_STOCK,
  sliceMatch,
  countByShop,
  unitsByShop,
  dailySeries,
  topItems,
  stockSnapshot,
  sumStock,
  sliceMetrics,
  perStallMetrics,
  wastePct,
};
