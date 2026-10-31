const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const router = express.Router();

const Shop = require('../models/Shop');
const User = require('../models/User');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Credit = require('../models/Credit');
const Spoilage = require('../models/Spoilage');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const StockMovement = require('../models/StockMovement');
const Production = require('../models/Production');
const CreditPayment = require('../models/CreditPayment');
const CreditReturn = require('../models/CreditReturn');
const { invalidateShopCache } = require('../middleware/auth');
const { round2 } = require('../utils/money');
const { sendError } = require('../utils/ledger');
const { BadRequestError } = require('../utils/dateFilter');
const { isDateKey, todayKey, keysBack, DEFAULT_TIMEZONE } = require('../utils/shopDay');
const { summarizeByShop, outstandingCreditByShop, sumTotals, emptyTotals } = require('../utils/summary');

/*
 * Admin console API. Mounted behind requireAdmin in server.js.
 *
 * Nothing here changes the stall ledger: it only reads the same collections the
 * stalls write, through the same profit math (utils/summary.js), plus manages the
 * stalls themselves (create, edit, deactivate, delete).
 */

const MIN_PASSWORD_LENGTH = 6;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cleanText(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Hour (0-12) the stall's business day starts: 0 = midnight, 4 = a 1am sale still counts for the day before. */
function dayStartHour(value) {
  if (value === undefined || value === null || value === '') return 0;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 12) {
    throw new BadRequestError('Business day start must be a whole hour from 0 to 12');
  }
  return hour;
}

function toObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new BadRequestError('Invalid stall id');
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * The date window every admin view shares. `from`/`to` (YYYY-MM-DD) win; otherwise
 * `period` is today / week / month in the default timezone, or `all` (the default)
 * for the whole competition.
 */
function dateCondition(query) {
  const { from, to, period } = query;

  if (from && !isDateKey(from)) throw new BadRequestError('"from" must be YYYY-MM-DD');
  if (to && !isDateKey(to)) throw new BadRequestError('"to" must be YYYY-MM-DD');
  if (from && to && from > to) throw new BadRequestError('"from" must not be after "to"');

  if (from || to) {
    const cond = {};
    if (from) cond.$gte = from;
    if (to) cond.$lte = to;
    return cond;
  }

  if (period === 'day' || period === 'week' || period === 'month') {
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const keys = keysBack(days, DEFAULT_TIMEZONE, 0);
    return { $gte: keys[keys.length - 1], $lte: keys[0] };
  }

  return null;
}

/**
 * Stalls matching the optional filters: `stalls` (comma-separated ids, what the
 * multi-select sends), `stall` (a single id) and `owner` (name search). No filter
 * means every stall.
 */
async function selectedShops(query) {
  const filter = {};
  const ids = [
    ...String(query.stalls || '').split(','),
    ...(query.stall ? [query.stall] : []),
  ]
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length) filter._id = { $in: ids.map(toObjectId) };
  const owner = cleanText(query.owner, 80);
  if (owner) filter.owner_name = { $regex: escapeRegex(owner), $options: 'i' };
  return Shop.find(filter).sort({ created_at: 1 }).lean();
}

function ledgerMatch(shops, query, { includeVoided = false } = {}) {
  const match = { shop: { $in: shops.map((s) => s._id) } };
  const dates = dateCondition(query);
  if (dates) match.date_key = dates;
  if (!includeVoided) match.voided_at = null;
  return match;
}

const marginPct = (profit, revenue) => (revenue > 0 ? round2((profit / revenue) * 100) : 0);

// ---------------------------------------------------------------- stalls

router.get('/stalls', async (req, res) => {
  try {
    const [shops, users] = await Promise.all([
      Shop.find().sort({ created_at: 1 }).lean(),
      User.find({ role: { $ne: 'admin' } }).select('username shop role active').lean(),
    ]);

    const usersByShop = new Map();
    for (const user of users) {
      const key = String(user.shop);
      if (!usersByShop.has(key)) usersByShop.set(key, []);
      usersByShop.get(key).push({ username: user.username, role: user.role });
    }

    res.json(
      shops.map((shop) => ({
        id: shop._id,
        name: shop.name,
        owner_name: shop.owner_name || '',
        phone: shop.phone || '',
        day_start_hour: shop.day_start_hour || 0,
        active: shop.active !== false,
        created_at: shop.created_at,
        users: usersByShop.get(String(shop._id)) || [],
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/stalls', async (req, res) => {
  let shop = null;
  try {
    const name = cleanText(req.body.name);
    const username = cleanText(req.body.username, 40);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name) throw new BadRequestError('Stall name is required');
    if (username.length < 3) throw new BadRequestError('Username must be at least 3 characters');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (await User.exists({ username })) {
      throw new BadRequestError('That username is already taken');
    }

    shop = await Shop.create({
      name,
      // The stall and its customer are the same thing, so one name serves both.
      owner_name: name,
      phone: cleanText(req.body.phone, 20),
      day_start_hour: dayStartHour(req.body.day_start_hour),
    });

    await User.create({
      username,
      password_hash: await bcrypt.hash(password, 10),
      shop: shop._id,
      role: 'owner',
    });

    res.status(201).json({ id: shop._id, name: shop.name, username });
  } catch (err) {
    // Do not leave a login-less stall behind if the user could not be created.
    if (shop) await Shop.deleteOne({ _id: shop._id }).catch(() => {});
    if (err.code === 11000) {
      return res.status(400).json({ error: 'That username is already taken' });
    }
    sendError(res, err);
  }
});

router.patch('/stalls/:id', async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) {
      const name = cleanText(req.body.name);
      if (!name) throw new BadRequestError('Stall name is required');
      update.name = name;
      update.owner_name = name;
    }
    if (req.body.phone !== undefined) update.phone = cleanText(req.body.phone, 20);
    if (req.body.day_start_hour !== undefined) update.day_start_hour = dayStartHour(req.body.day_start_hour);

    const shop = await Shop.findByIdAndUpdate(toObjectId(req.params.id), update, { new: true });
    if (!shop) return res.status(404).json({ error: 'Stall not found' });

    invalidateShopCache(shop._id);
    res.json({ id: shop._id, name: shop.name, owner_name: shop.owner_name, phone: shop.phone });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/stalls/:id/reset-password', async (req, res) => {
  try {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const result = await User.updateMany(
      { shop: toObjectId(req.params.id) },
      { password_hash: await bcrypt.hash(password, 10) }
    );
    if (!result.matchedCount) return res.status(404).json({ error: 'No login found for this stall' });

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch('/stalls/:id/active', async (req, res) => {
  try {
    if (typeof req.body.active !== 'boolean') {
      throw new BadRequestError('"active" must be true or false');
    }

    const id = toObjectId(req.params.id);
    const shop = await Shop.findByIdAndUpdate(id, { active: req.body.active }, { new: true });
    if (!shop) return res.status(404).json({ error: 'Stall not found' });

    await User.updateMany({ shop: id }, { active: req.body.active });
    invalidateShopCache(id);

    res.json({ id: shop._id, active: shop.active });
  } catch (err) {
    sendError(res, err);
  }
});

// Irreversible, so the stall's name has to be typed back as confirmation.
router.delete('/stalls/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    const shop = await Shop.findById(id).lean();
    if (!shop) return res.status(404).json({ error: 'Stall not found' });

    if (cleanText(req.body?.confirm_name) !== shop.name) {
      throw new BadRequestError('Type the stall name exactly to confirm deletion');
    }

    await Promise.all(
      [Sale, Purchase, Credit, CreditPayment, CreditReturn, Spoilage, SalesReturn, PurchaseReturn, StockMovement, Production, Item, User].map(
        (Model) => Model.deleteMany({ shop: id })
      )
    );
    await Shop.deleteOne({ _id: id });
    invalidateShopCache(id);

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// -------------------------------------------------------- overview & compare

async function stallRows(shops, query) {
  const match = ledgerMatch(shops, query);
  const [byShop, outstanding] = await Promise.all([
    summarizeByShop(match),
    outstandingCreditByShop({ shop: { $in: shops.map((s) => s._id) } }),
  ]);

  return shops.map((shop) => {
    const key = String(shop._id);
    const totals = byShop.get(key) || emptyTotals();
    return {
      id: shop._id,
      name: shop.name,
      owner_name: shop.owner_name || '',
      active: shop.active !== false,
      ...totals,
      margin_pct: marginPct(totals.net_profit, totals.revenue),
      outstanding_credit: outstanding.get(key) || 0,
    };
  });
}

router.get('/overview', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const rows = await stallRows(shops, req.query);
    const totals = sumTotals(rows);

    const match = ledgerMatch(shops, req.query);
    const [salePay, collectedPay, saleCount, creditCount] = await Promise.all([
      Sale.aggregate([{ $match: match }, { $group: { _id: '$payment_mode', total: { $sum: '$total_amount' } } }]),
      // Credit collected (refunds are negative) counts under the way it was paid.
      CreditPayment.aggregate([{ $match: match }, { $group: { _id: '$payment_mode', total: { $sum: '$amount' } } }]),
      Sale.countDocuments(match),
      Credit.countDocuments(match),
    ]);

    const received = (mode) =>
      round2(
        (salePay.find((p) => p._id === mode)?.total || 0) +
          (collectedPay.find((p) => p._id === mode)?.total || 0)
      );

    res.json({
      totals: {
        ...totals,
        margin_pct: marginPct(totals.net_profit, totals.revenue),
        outstanding_credit: round2(rows.reduce((sum, r) => sum + r.outstanding_credit, 0)),
      },
      payment_split: { cash: received('cash'), gpay: received('gpay') },
      transactions: saleCount + creditCount,
      stalls: shops.length,
      active_stalls: shops.filter((s) => s.active !== false).length,
      today: todayKey(DEFAULT_TIMEZONE, 0),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/comparison', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const rows = (await stallRows(shops, req.query)).sort((a, b) => b.net_profit - a.net_profit);

    const top = (list, field, limit = 3) =>
      list
        .filter((r) => r[field] > 0)
        .sort((a, b) => b[field] - a[field])
        .slice(0, limit)
        .map((r) => ({ id: r.id, name: r.name, owner_name: r.owner_name, value: r[field] }));

    res.json({
      stalls: rows,
      leaderboard: {
        net_profit: top(rows, 'net_profit'),
        revenue: top(rows, 'revenue'),
        margin_pct: top(rows, 'margin_pct'),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

// -------------------------------------------------------------- analytics

router.get('/analytics', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const match = ledgerMatch(shops, req.query);

    // Same rule as the dashboard: cash sales + credit sales, less goods returned
    // (cash or credit), so every chart adds up to the same revenue.
    const bucket = (Model, expr, amount, orders) =>
      Model.aggregate([
        { $match: match },
        { $group: { _id: expr, revenue: { $sum: `$${amount}` }, orders: { $sum: orders } } },
      ]);
    const hourExpr = { $hour: { date: '$date', timezone: DEFAULT_TIMEZONE } };
    const dayExpr = { $dayOfWeek: { date: '$date', timezone: DEFAULT_TIMEZONE } };

    const lineGroup = (id) => ({
      $group: {
        _id: id,
        name: { $first: '$items.item_name' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.line_total' },
        cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
      },
    });
    const returnGroup = (id) => ({
      $group: {
        _id: id,
        quantity: { $sum: '$quantity' },
        revenue: { $sum: '$refund_amount' },
        cogs: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
      },
    });
    const itemKey = { $toLower: '$items.item_name' };
    const returnItemKey = { $toLower: '$item_name' };

    const [
      saleHours, creditHours, saleRetHours, creditRetHours,
      saleDays, creditDays, saleRetDays, creditRetDays,
      saleItems, creditItems, saleRetItems, creditRetItems,
      saleDates, creditDates, saleRetDates, creditRetDates,
    ] = await Promise.all([
      bucket(Sale, hourExpr, 'total_amount', 1),
      bucket(Credit, hourExpr, 'total_amount', 1),
      bucket(SalesReturn, hourExpr, 'refund_amount', { $literal: 0 }),
      bucket(CreditReturn, hourExpr, 'refund_amount', { $literal: 0 }),
      bucket(Sale, dayExpr, 'total_amount', 1),
      bucket(Credit, dayExpr, 'total_amount', 1),
      bucket(SalesReturn, dayExpr, 'refund_amount', { $literal: 0 }),
      bucket(CreditReturn, dayExpr, 'refund_amount', { $literal: 0 }),
      Sale.aggregate([{ $match: match }, { $unwind: '$items' }, lineGroup(itemKey)]),
      Credit.aggregate([{ $match: match }, { $unwind: '$items' }, lineGroup(itemKey)]),
      SalesReturn.aggregate([{ $match: match }, returnGroup(returnItemKey)]),
      CreditReturn.aggregate([{ $match: match }, returnGroup(returnItemKey)]),
      Sale.aggregate([{ $match: match }, { $unwind: '$items' }, lineGroup('$date_key')]),
      Credit.aggregate([{ $match: match }, { $unwind: '$items' }, lineGroup('$date_key')]),
      SalesReturn.aggregate([{ $match: match }, returnGroup('$date_key')]),
      CreditReturn.aggregate([{ $match: match }, returnGroup('$date_key')]),
    ]);

    /** Add the "plus" lists and subtract the "minus" lists, keyed by _id. */
    const combine = (plus, minus) => {
      const map = new Map();
      const add = (row, sign) => {
        const entry = map.get(row._id) || { _id: row._id, name: row.name, revenue: 0, orders: 0, quantity: 0, cogs: 0 };
        entry.name = entry.name || row.name;
        entry.revenue += sign * (row.revenue || 0);
        entry.orders += sign * (row.orders || 0);
        entry.quantity += sign * (row.quantity || 0);
        entry.cogs += sign * (row.cogs || 0);
        map.set(row._id, entry);
      };
      plus.flat().forEach((row) => add(row, 1));
      minus.flat().forEach((row) => add(row, -1));
      return map;
    };

    const hours = combine([saleHours, creditHours], [saleRetHours, creditRetHours]);
    const weekdays = combine([saleDays, creditDays], [saleRetDays, creditRetDays]);
    const items = combine([saleItems, creditItems], [saleRetItems, creditRetItems]);
    const dates = combine([saleDates, creditDates], [saleRetDates, creditRetDates]);

    const peak_hours = Array.from({ length: 24 }, (_, hour) => {
      const row = hours.get(hour);
      return { hour, revenue: round2(row?.revenue || 0), orders: row?.orders || 0 };
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const by_weekday = dayNames.map((day, index) => {
      const row = weekdays.get(index + 1);
      return { day, revenue: round2(row?.revenue || 0), orders: row?.orders || 0 };
    });

    const trend = [...dates.values()]
      .sort((x, y) => (x._id < y._id ? -1 : 1))
      .map((d) => ({ date: d._id, revenue: round2(d.revenue), profit: round2(d.revenue - d.cogs) }));

    const top_items = [...items.values()]
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 10)
      .map((i) => ({
        name: i.name || i._id,
        quantity: round2(i.quantity),
        revenue: round2(i.revenue),
        profit: round2(i.revenue - i.cogs),
      }));

    const busiestHour = [...peak_hours].sort((x, y) => y.revenue - x.revenue)[0];
    const busiestDay = [...by_weekday].sort((x, y) => y.revenue - x.revenue)[0];

    res.json({
      peak_hours,
      by_weekday,
      top_items,
      trend,
      busiest_hour: busiestHour && busiestHour.revenue > 0 ? busiestHour.hour : null,
      busiest_day: busiestDay && busiestDay.revenue > 0 ? busiestDay.day : null,
      timezone: DEFAULT_TIMEZONE,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------------------------------------------------------------- reports

const REPORT_LIMIT = 2000;

const PAYMENT_FILTERS = ['cash', 'gpay', 'credit'];

async function listReport(req, res, Model, toRow) {
  const shops = await selectedShops(req.query);
  const shopById = new Map(shops.map((s) => [String(s._id), s]));

  const match = ledgerMatch(shops, req.query, { includeVoided: req.query.include_voided === 'true' });
  if (req.query.payment_mode === 'cash' || req.query.payment_mode === 'gpay') {
    match.payment_mode = req.query.payment_mode;
  }

  const docs = await Model.find(match).sort({ date: -1 }).limit(REPORT_LIMIT).lean();

  const rows = docs.map((doc) => {
    const shop = shopById.get(String(doc.shop));
    return {
      id: doc._id,
      stall: shop?.name || 'Unknown',
      owner_name: shop?.owner_name || '',
      date: doc.date,
      date_key: doc.date_key,
      payment_mode: doc.payment_mode,
      voided: Boolean(doc.voided_at),
      void_reason: doc.void_reason || '',
      ...toRow(doc),
    };
  });

  const total = round2(rows.filter((r) => !r.voided).reduce((sum, r) => sum + r.amount, 0));
  res.json({ rows, total, count: rows.length, truncated: docs.length === REPORT_LIMIT });
}

/*
 * The sales report follows the same rule as the dashboard: cash/GPay sales plus credit
 * sales, with goods returned shown as negative rows, so its total is the dashboard's
 * revenue. Filtering by payment mode narrows it to that kind of row.
 */
router.get('/reports/sales', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const shopById = new Map(shops.map((s) => [String(s._id), s]));
    const mode = PAYMENT_FILTERS.includes(req.query.payment_mode) ? req.query.payment_mode : '';
    const includeVoided = req.query.include_voided === 'true';
    const match = ledgerMatch(shops, req.query, { includeVoided });

    const wantSales = !mode || mode === 'cash' || mode === 'gpay';
    const wantCredit = !mode || mode === 'credit';
    const wantReturns = !mode;
    const find = (Model, extra = {}) => Model.find({ ...match, ...extra }).sort({ date: -1 }).limit(REPORT_LIMIT).lean();

    const [sales, credits, saleReturns, creditReturns] = await Promise.all([
      wantSales ? find(Sale, mode ? { payment_mode: mode } : {}) : [],
      wantCredit ? find(Credit) : [],
      wantReturns ? find(SalesReturn) : [],
      wantReturns ? find(CreditReturn) : [],
    ]);

    const base = (doc) => {
      const shop = shopById.get(String(doc.shop));
      return {
        id: doc._id,
        stall: shop?.name || 'Unknown',
        owner_name: shop?.owner_name || '',
        date: doc.date,
        date_key: doc.date_key,
        voided: Boolean(doc.voided_at),
        void_reason: doc.void_reason || '',
      };
    };
    const lines = (doc) => doc.items.map((i) => `${i.item_name} × ${i.quantity}`).join(', ');

    const rows = [
      ...sales.map((d) => ({ ...base(d), payment_mode: d.payment_mode, amount: d.total_amount, detail: lines(d) })),
      ...credits.map((d) => ({ ...base(d), payment_mode: 'credit', amount: d.total_amount, detail: `${d.customer_name}: ${lines(d)}` })),
      ...saleReturns.map((d) => ({ ...base(d), id: `r-${d._id}`, payment_mode: 'return', amount: -d.refund_amount, detail: `Return: ${d.item_name} × ${d.quantity}` })),
      ...creditReturns.map((d) => ({ ...base(d), id: `cr-${d._id}`, payment_mode: 'return', amount: -d.refund_amount, detail: `Credit return: ${d.item_name} × ${d.quantity}` })),
    ]
      .sort((x, y) => new Date(y.date) - new Date(x.date))
      .slice(0, REPORT_LIMIT);

    const total = round2(rows.filter((r) => !r.voided).reduce((sum, r) => sum + r.amount, 0));
    res.json({
      rows,
      total,
      count: rows.length,
      truncated: [sales, credits, saleReturns, creditReturns].some((l) => l.length === REPORT_LIMIT),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// One row per stall and product: units, revenue, cost and profit. Cash and credit sales
// count, goods returned are taken off, so the totals match the dashboard.
router.get('/reports/sales-by-product', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const shopById = new Map(shops.map((s) => [String(s._id), s]));
    const match = ledgerMatch(shops, req.query);
    const mode = PAYMENT_FILTERS.includes(req.query.payment_mode) ? req.query.payment_mode : '';

    const wantSales = !mode || mode === 'cash' || mode === 'gpay';
    const wantCredit = !mode || mode === 'credit';
    const wantReturns = !mode;

    const lineGroup = {
      $group: {
        _id: { shop: '$shop', item: { $toLower: '$items.item_name' } },
        name: { $first: '$items.item_name' },
        unit_type: { $first: '$items.unit_type' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.line_total' },
        cogs: { $sum: { $multiply: ['$items.quantity', '$items.cost_per_unit'] } },
      },
    };
    const returnGroup = {
      $group: {
        _id: { shop: '$shop', item: { $toLower: '$item_name' } },
        name: { $first: '$item_name' },
        quantity: { $sum: '$quantity' },
        revenue: { $sum: '$refund_amount' },
        cogs: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost_per_unit', 0] }] } },
      },
    };
    const saleMatch = mode === 'cash' || mode === 'gpay' ? { ...match, payment_mode: mode } : match;

    const [sales, credits, saleReturns, creditReturns] = await Promise.all([
      wantSales ? Sale.aggregate([{ $match: saleMatch }, { $unwind: '$items' }, lineGroup]) : [],
      wantCredit ? Credit.aggregate([{ $match: match }, { $unwind: '$items' }, lineGroup]) : [],
      wantReturns ? SalesReturn.aggregate([{ $match: match }, returnGroup]) : [],
      wantReturns ? CreditReturn.aggregate([{ $match: match }, returnGroup]) : [],
    ]);

    const map = new Map();
    const add = (group, sign) => {
      const key = `${group._id.shop}|${group._id.item}`;
      const entry = map.get(key) || { shop: group._id.shop, name: group.name, unit: group.unit_type || '', quantity: 0, revenue: 0, cogs: 0 };
      entry.unit = entry.unit || group.unit_type || '';
      entry.quantity += sign * group.quantity;
      entry.revenue += sign * group.revenue;
      entry.cogs += sign * group.cogs;
      map.set(key, entry);
    };
    [...sales, ...credits].forEach((g) => add(g, 1));
    [...saleReturns, ...creditReturns].forEach((g) => add(g, -1));

    const rows = [...map.entries()]
      .map(([key, e]) => {
        const shop = shopById.get(String(e.shop));
        return {
          id: key,
          stall: shop?.name || 'Unknown',
          owner_name: shop?.owner_name || '',
          item: e.name,
          unit: e.unit,
          quantity: round2(e.quantity),
          revenue: round2(e.revenue),
          cost: round2(e.cogs),
          profit: round2(e.revenue - e.cogs),
        };
      })
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, REPORT_LIMIT);

    res.json({
      rows,
      count: rows.length,
      truncated: map.size > REPORT_LIMIT,
      totals: {
        quantity: round2(rows.reduce((sum, r) => sum + r.quantity, 0)),
        revenue: round2(rows.reduce((sum, r) => sum + r.revenue, 0)),
        cost: round2(rows.reduce((sum, r) => sum + r.cost, 0)),
        profit: round2(rows.reduce((sum, r) => sum + r.profit, 0)),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/reports/purchases', async (req, res) => {
  try {
    await listReport(req, res, Purchase, (doc) => ({
      amount: doc.amount,
      detail: `${doc.item_name} × ${doc.quantity}${doc.vendor_name ? ` (${doc.vendor_name})` : ''}`,
    }));
  } catch (err) {
    sendError(res, err);
  }
});

// ----------------------------------------------------------------- voided

router.get('/voided', async (req, res) => {
  try {
    const shops = await selectedShops(req.query);
    const shopById = new Map(shops.map((s) => [String(s._id), s]));

    const match = ledgerMatch(shops, req.query, { includeVoided: true });
    match.voided_at = { $ne: null };

    const sources = [
      { type: 'Sale', Model: Sale, amount: (d) => d.total_amount, detail: (d) => d.items.map((i) => `${i.item_name} × ${i.quantity}`).join(', ') },
      { type: 'Purchase', Model: Purchase, amount: (d) => d.amount, detail: (d) => `${d.item_name} × ${d.quantity}` },
      { type: 'Credit', Model: Credit, amount: (d) => d.total_amount, detail: (d) => `${d.customer_name}: ${d.items.map((i) => i.item_name).join(', ')}` },
      { type: 'Spoilage', Model: Spoilage, amount: (d) => d.estimated_value, detail: (d) => `${d.item_name} × ${d.quantity} (${d.reason})` },
      { type: 'Credit return', Model: CreditReturn, amount: (d) => d.refund_amount, detail: (d) => `${d.item_name} × ${d.quantity}` },
      { type: 'Credit payment', Model: CreditPayment, amount: (d) => Math.abs(d.amount), detail: (d) => `${d.kind} (${d.payment_mode})` },
      { type: 'Cooking', Model: Production, amount: (d) => d.total_cost, detail: (d) => `${d.dish_name} × ${d.quantity}` },
      { type: 'Sales return', Model: SalesReturn, amount: (d) => d.refund_amount, detail: (d) => `${d.item_name} × ${d.quantity}` },
      { type: 'Purchase return', Model: PurchaseReturn, amount: (d) => d.refund_amount, detail: (d) => `${d.item_name} × ${d.quantity}` },
    ];

    const lists = await Promise.all(
      sources.map(async ({ type, Model, amount, detail }) => {
        const docs = await Model.find(match).sort({ voided_at: -1 }).limit(500).lean();
        return docs.map((doc) => {
          const shop = shopById.get(String(doc.shop));
          return {
            id: doc._id,
            type,
            stall: shop?.name || 'Unknown',
            owner_name: shop?.owner_name || '',
            date_key: doc.date_key,
            detail: detail(doc),
            amount: round2(amount(doc) || 0),
            voided_by: doc.voided_by || '',
            voided_at: doc.voided_at,
            reason: doc.void_reason || doc.reason || '',
          };
        });
      })
    );

    const rows = lists.flat().sort((a, b) => new Date(b.voided_at) - new Date(a.voided_at)).slice(0, 500);
    res.json({ rows, count: rows.length });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
