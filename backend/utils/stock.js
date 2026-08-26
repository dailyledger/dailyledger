const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const { round3 } = require('./money');

// Thrown when a guarded decrement finds insufficient stock. Routes translate it
// into the 409 "this will go negative — confirm?" response (blocker 06b).
class InsufficientStockError extends Error {
  constructor(shortfalls) {
    super('Insufficient stock');
    this.name = 'InsufficientStockError';
    this.shortfalls = shortfalls;
  }
}

/**
 * Which of `lines` would take stock negative, and by how much.
 * Read-only: used to build the confirmation prompt before anything is written.
 *
 * `lines` are { item_name, quantity } where quantity is in stock units.
 */
async function findShortfalls(shop, lines, session) {
  const shortfalls = [];

  // Several lines can name the same item; they draw from one pool.
  const wanted = new Map();
  for (const line of lines) {
    const key = String(line.item_name).trim().toLowerCase();
    const entry = wanted.get(key) || { item_name: line.item_name, quantity: 0 };
    entry.quantity = round3(entry.quantity + line.quantity);
    wanted.set(key, entry);
  }

  for (const entry of wanted.values()) {
    const item = await Item.findByName(shop, entry.item_name, session);
    const available = item ? item.stock_quantity : 0;
    if (entry.quantity > available) {
      shortfalls.push({
        item_name: item ? item.item_name : entry.item_name,
        requested: entry.quantity,
        available,
        short_by: round3(entry.quantity - available),
      });
    }
  }

  return shortfalls;
}

/**
 * Apply a signed change to an item's stock and append the matching movement row.
 *
 * When `allowNegative` is false and `delta` is negative, the check and the write
 * are a single conditional update — the `$gte` guard lives inside the filter, so
 * there is no window between "is there enough?" and "take it" for a second
 * request to slip through (blocker 06d).
 *
 * Returns the item's stock level after the move.
 */
async function moveStock({
  shop,
  item_name,
  delta,
  reason,
  ref_model = null,
  ref_id = null,
  cost_per_unit = 0,
  date = new Date(),
  date_key,
  note,
  allowNegative = false,
  session = null,
}) {
  if (!date_key) {
    throw new Error('moveStock: date_key is required');
  }

  const amount = round3(delta);
  if (amount === 0) {
    return null;
  }

  const item = await Item.findByName(shop, item_name, session);
  if (!item) {
    throw new Error(`Item "${item_name}" not found in this shop's catalog`);
  }

  const filter = { _id: item._id, shop };
  if (amount < 0 && !allowNegative) {
    filter.stock_quantity = { $gte: -amount };
  }

  const result = await Item.updateOne(
    filter,
    { $inc: { stock_quantity: amount } },
    session ? { session } : undefined
  );

  if (result.matchedCount === 0) {
    // The guard rejected it: someone else consumed the stock between our read
    // and this update, or there was never enough.
    throw new InsufficientStockError([
      {
        item_name: item.item_name,
        requested: -amount,
        available: item.stock_quantity,
        short_by: round3(-amount - item.stock_quantity),
      },
    ]);
  }

  await StockMovement.create(
    [
      {
        shop,
        item_name: item.item_name,
        delta: amount,
        reason,
        ref_model,
        ref_id,
        cost_per_unit,
        note,
        date,
        date_key,
      },
    ],
    session ? { session } : undefined
  );

  return round3(item.stock_quantity + amount);
}

/** Recompute an item's stock from its movement log. Used by scripts/verifyStock.js. */
async function stockFromMovements(shop, item_name, session) {
  const rows = await StockMovement.aggregate([
    { $match: { shop, item_name } },
    { $group: { _id: null, total: { $sum: '$delta' } } },
  ]).session(session || undefined);

  return rows.length ? round3(rows[0].total) : 0;
}

module.exports = {
  InsufficientStockError,
  findShortfalls,
  moveStock,
  stockFromMovements,
};
