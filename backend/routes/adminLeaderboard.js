const express = require('express');
const router = express.Router();

const Shop = require('../models/Shop');
const Sale = require('../models/Sale');
const Credit = require('../models/Credit');
const Spoilage = require('../models/Spoilage');
const Purchase = require('../models/Purchase');
const { round2 } = require('../utils/money');
const { sendError } = require('../utils/ledger');
const { DEFAULT_TIMEZONE } = require('../utils/shopDay');
const { BadRequestError } = require('../utils/dateFilter');
const { dateCondition, previousDateCondition, selectedShops, toObjectId } = require('../utils/adminFilters');
const {
  sliceMatch,
  countByShop,
  topItems,
  stockSnapshot,
  sliceMetrics,
  perStallMetrics,
} = require('../utils/adminMetrics');
const { readSettings } = require('./adminSections');

/*
 * The competition view: who is winning and why. The leaderboard ranks stalls in five
 * categories and totals the positions into an overall champion; the highlights turn the
 * same numbers into plain sentences and flag things worth a look; the scorecard is the
 * one-stall summary judges can print.
 */

const CATEGORIES = [
  { key: 'net_profit', title: 'Highest profit', dir: 'desc', unit: 'money' },
  { key: 'revenue', title: 'Top revenue', dir: 'desc', unit: 'money' },
  { key: 'margin_pct', title: 'Best margin', dir: 'desc', unit: 'percent' },
  { key: 'waste_pct', title: 'Least waste', dir: 'asc', unit: 'percent' },
  { key: 'orders', title: 'Most orders', dir: 'desc', unit: 'count' },
];

const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Rank stalls in each category and total the positions (lower is better). Stalls with no
 * sales yet are listed but not ranked. Equal values share a position; the overall order
 * breaks ties by profit so there is always exactly one champion.
 */
function rankStalls(rows) {
  const active = rows.filter((r) => r.revenue > 0);
  const positions = new Map(rows.map((r) => [String(r.id), {}]));
  const awards = [];

  for (const cat of CATEGORIES) {
    const sorted = [...active].sort((a, b) => (cat.dir === 'desc' ? b[cat.key] - a[cat.key] : a[cat.key] - b[cat.key]));
    let rank = 0;
    let last = null;
    sorted.forEach((row, index) => {
      if (row[cat.key] !== last) {
        rank = index + 1;
        last = row[cat.key];
      }
      positions.get(String(row.id))[cat.key] = rank;
    });
    awards.push({
      key: cat.key,
      title: cat.title,
      unit: cat.unit,
      winner: sorted[0] ? { id: sorted[0].id, name: sorted[0].name, value: sorted[0][cat.key] } : null,
    });
  }

  const scored = rows.map((row) => {
    const ranks = positions.get(String(row.id));
    const isActive = row.revenue > 0;
    return { ...row, ranks, score: isActive ? CATEGORIES.reduce((sum, c) => sum + ranks[c.key], 0) : null };
  });

  const order = scored
    .filter((r) => r.score !== null)
    .sort((a, b) => a.score - b.score || b.net_profit - a.net_profit);
  order.forEach((row, index) => {
    row.overall_rank = index + 1;
  });
  const ranked = scored.filter((r) => r.score === null).map((r) => ({ ...r, overall_rank: null }));

  return { stalls: [...order, ...ranked], awards, ranked_count: order.length };
}

async function leaderboardFor(query) {
  const shops = await selectedShops(query);
  const rows = await perStallMetrics(shops, dateCondition(query));
  return rankStalls(rows);
}

router.get('/leaderboard', async (req, res) => {
  try {
    const board = await leaderboardFor(req.query);
    const settings = await readSettings();
    res.json({ ...board, categories: CATEGORIES, event: { name: settings.name, tagline: settings.tagline }, updated_at: new Date() });
  } catch (err) {
    sendError(res, err);
  }
});

// -------------------------------------------------------------- highlights

const TWO_HOURS = 2 * 60 * 60 * 1000;

router.get('/insights', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const ids = shops.map((s) => s._id);
    const dates = dateCondition(req.query);
    const before = previousDateCondition(req.query);
    const match = sliceMatch(ids, dates);

    const [rows, prevRows, lastSale, lastCredit, sales, voidedSales, snapshot, best, hours] = await Promise.all([
      perStallMetrics(shops, dates),
      before ? perStallMetrics(shops, before) : null,
      Sale.aggregate([{ $match: { shop: { $in: ids }, voided_at: null } }, { $group: { _id: '$shop', at: { $max: '$date' } } }]),
      Credit.aggregate([{ $match: { shop: { $in: ids }, voided_at: null } }, { $group: { _id: '$shop', at: { $max: '$date' } } }]),
      countByShop(Sale, match),
      countByShop(Sale, { ...match, voided_at: { $ne: null } }),
      stockSnapshot(ids),
      topItems(match, 1),
      Sale.aggregate([
        { $match: match },
        { $group: { _id: { $hour: { date: '$date', timezone: DEFAULT_TIMEZONE } }, revenue: { $sum: '$total_amount' } } },
        { $sort: { revenue: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const items = [];
    const add = (tone, title, text) => items.push({ id: `${items.length}-${title}`, tone, title, text });
    const active = rows.filter((r) => r.revenue > 0);

    if (active.length === 0) {
      add('info', 'No sales yet', 'Nothing has been sold in this period. Highlights appear once stalls start selling.');
    } else {
      const leader = [...active].sort((a, b) => b.net_profit - a.net_profit)[0];
      add('good', 'Profit leader', `${leader.name} is ahead with ${money(leader.net_profit)} profit on ${money(leader.revenue)} of sales.`);

      if (best[0]) add('info', 'Best seller', `${best[0].name} is the top seller with ${money(best[0].revenue)} in sales.`);

      if (hours[0] && hours[0].revenue > 0) {
        const h = hours[0]._id;
        const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;
        add('info', 'Busiest hour', `Sales peak around ${label}, so that is when stalls need the most stock ready.`);
      }

      if (prevRows) {
        const before_ = new Map(prevRows.map((r) => [String(r.id), r]));
        const moves = active
          .map((r) => ({ r, prev: before_.get(String(r.id)) }))
          .filter((m) => m.prev && m.prev.revenue >= 500)
          .map((m) => ({ ...m, change: ((m.r.revenue - m.prev.revenue) / m.prev.revenue) * 100 }));
        const up = [...moves].sort((a, b) => b.change - a.change)[0];
        const down = [...moves].sort((a, b) => a.change - b.change)[0];
        if (up && up.change >= 10) add('good', 'Rising stall', `${up.r.name}'s sales are up ${Math.round(up.change)}% on the previous period.`);
        if (down && down.change <= -25) add('warn', 'Sales falling', `${down.r.name}'s sales are down ${Math.round(Math.abs(down.change))}% on the previous period.`);
      }
    }

    for (const r of rows.filter((x) => x.waste_pct >= 10 && x.spoilage >= 50).slice(0, 3)) {
      add('warn', 'High waste', `${r.name} wrote off ${money(r.spoilage)} of stock, ${Math.round(r.waste_pct)}% of what it bought.`);
    }
    for (const r of active.filter((x) => x.revenue >= 500 && x.margin_pct < 15).slice(0, 3)) {
      add('warn', 'Thin margin', `${r.name} keeps only ${r.margin_pct}% of its sales as profit. Its prices or costs may need a look.`);
    }
    for (const r of rows.filter((x) => x.credit_outstanding > 500 && x.credit_outstanding > 0.3 * x.revenue).slice(0, 3)) {
      add('warn', 'Credit risk', `${r.name} is owed ${money(r.credit_outstanding)} on credit, a large share of its sales.`);
    }

    // Stalls that went quiet while others are still selling.
    const latest = new Map();
    [...lastSale, ...lastCredit].forEach((row) => {
      const key = String(row._id);
      if (!latest.has(key) || row.at > latest.get(key)) latest.set(key, row.at);
    });
    const now = Date.now();
    const anyoneSelling = [...latest.values()].some((at) => now - new Date(at).getTime() < TWO_HOURS);
    if (anyoneSelling) {
      for (const shop of shops.filter((s) => s.active !== false)) {
        const at = latest.get(String(shop._id));
        if (at && now - new Date(at).getTime() >= TWO_HOURS) {
          const hours_ = Math.floor((now - new Date(at).getTime()) / 3600000);
          add('warn', 'Quiet stall', `${shop.name} has not recorded a sale for ${hours_} hours while other stalls are selling.`);
        }
      }
    }

    for (const shop of shops) {
      const key = String(shop._id);
      const voided = voidedSales.get(key) || 0;
      const live = sales.get(key) || 0;
      if (voided >= 3 && voided / (voided + live) >= 0.2) {
        add('warn', 'Many cancelled sales', `${shop.name} cancelled ${voided} of ${voided + live} sales (${Math.round((voided / (voided + live)) * 100)}%). Worth a look at the voided entries.`);
      }
      const negative = snapshot.byShop.get(key)?.negative || 0;
      if (negative > 0) {
        add('warn', 'Stock needs checking', `${shop.name} has ${negative} item${negative > 1 ? 's' : ''} with negative stock, so a purchase was probably not recorded.`);
      }
    }

    res.json({ items });
  } catch (err) {
    sendError(res, err);
  }
});

// --------------------------------------------------------------- scorecard

const PERIOD_LABELS = { all: 'Whole event', day: 'Today', week: 'Last 7 days', month: 'Last 30 days' };

router.get('/scorecard/:id', async (req, res) => {
  try {
    const shop = await Shop.findById(toObjectId(req.params.id)).lean();
    if (!shop) throw new BadRequestError('Stall not found');

    const dates = dateCondition(req.query);
    const match = sliceMatch([shop._id], dates);
    const [slice, board, settings, salePay, creditSales, reasons, vendors] = await Promise.all([
      sliceMetrics([shop], dates),
      leaderboardFor({ ...req.query, stalls: '', stall: '' }),
      readSettings(),
      Sale.aggregate([{ $match: match }, { $group: { _id: '$payment_mode', total: { $sum: '$total_amount' } } }]),
      Credit.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$total_amount' } } }]),
      Spoilage.aggregate([{ $match: match }, { $group: { _id: '$reason', value: { $sum: '$estimated_value' } } }]),
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: { $toLower: '$vendor_name' }, name: { $first: '$vendor_name' }, spent: { $sum: '$amount' } } },
        { $sort: { spent: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const row = board.stalls.find((s) => String(s.id) === String(shop._id));
    const payment = (mode) => round2(salePay.find((p) => p._id === mode)?.total || 0);

    res.json({
      event: { name: settings.name, tagline: settings.tagline },
      stall: { name: shop.name, owner_name: shop.owner_name || '', phone: shop.phone || '' },
      period: req.query.from || req.query.to ? `${req.query.from || 'start'} to ${req.query.to || 'today'}` : PERIOD_LABELS[req.query.period] || PERIOD_LABELS.all,
      metrics: slice.metrics,
      trend: slice.trend,
      top_items: slice.top_items,
      ranks: row?.ranks || {},
      overall_rank: row?.overall_rank ?? null,
      score: row?.score ?? null,
      ranked_count: board.ranked_count,
      payment: { cash: payment('cash'), gpay: payment('gpay'), credit: round2(creditSales[0]?.total || 0) },
      wastage: {
        expired: round2(reasons.find((r) => r._id === 'expired')?.value || 0),
        damaged: round2(reasons.find((r) => r._id === 'damaged')?.value || 0),
      },
      top_vendors: vendors.map((v) => ({ name: v.name, spent: round2(v.spent) })),
      generated_at: new Date(),
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
module.exports.rankStalls = rankStalls;
