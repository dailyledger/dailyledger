const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const { BadRequestError } = require('./dateFilter');
const { isDateKey, keysBack, DEFAULT_TIMEZONE } = require('./shopDay');
const { round2 } = require('./money');

/*
 * Filters shared by every admin endpoint: which stalls, which dates, and the window just
 * before them for "vs previous period" figures.
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cleanText(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
 * The window just before the selected one and as long as it, for "vs previous period"
 * badges. Null for "all time", where there is nothing to compare with.
 */
function previousDateCondition(query) {
  const { from, to, period } = query;
  const DAY = 864e5;
  const key = (date) => date.toISOString().slice(0, 10);
  const at = (value) => new Date(`${value}T00:00:00.000Z`);

  if (from || to) {
    if (!from || !to) return null;
    const days = Math.round((at(to) - at(from)) / DAY) + 1;
    return {
      $gte: key(new Date(at(from).getTime() - days * DAY)),
      $lte: key(new Date(at(from).getTime() - DAY)),
    };
  }

  const span = { day: 1, week: 7, month: 30 }[period];
  if (!span) return null;
  // Newest first: [0..span-1] is the current window, [span..2*span-1] the one before it.
  const keys = keysBack(span * 2, DEFAULT_TIMEZONE, 0);
  return { $gte: keys[keys.length - 1], $lte: keys[span] };
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

module.exports = {
  escapeRegex,
  cleanText,
  toObjectId,
  dateCondition,
  previousDateCondition,
  selectedShops,
  ledgerMatch,
  marginPct,
};
