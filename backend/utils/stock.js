const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const Purchase = require('../models/Purchase');
const Production = require('../models/Production');
const { BadRequestError } = require('./dateFilter');
const { round3, round4 } = require('./money');

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

const round6 = (value) => Math.round((Number(value) + Number.EPSILON) * 1e6) / 1e6;
const escapeRegex = (text) => String(text).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where an item's cost comes from when the running value cannot answer (a purchase
 * was cancelled after some of its goods were already sold): the latest purchase or
 * cooking batch that is still valid, leaving out the document being reversed.
 */
async function latestValidCost({ shop, item_name, ref_model, ref_id, session }) {
  const name = { $regex: `^${escapeRegex(item_name)}$`, $options: 'i' };
  const skip = (model) => (ref_model === model && ref_id ? { _id: { $ne: ref_id } } : {});
  const opts = session ? { session } : undefined;

  const purchase = await Purchase.findOne(
    { shop, item_name: name, voided_at: null, ...skip('Purchase') },
    null,
    { ...opts, sort: { date: -1, _id: -1 } }
  ).lean();
  if (purchase) {
    const units = purchase.quantity * (purchase.units_per_pack > 1 ? purchase.units_per_pack : 1);
    if (units > 0) return round4(purchase.amount / units);
  }

  const batch = await Production.findOne(
    { shop, dish_name: name, voided_at: null, ...skip('Production') },
    null,
    { ...opts, sort: { date: -1, _id: -1 } }
  ).lean();
  return batch ? batch.cost_per_unit : null;
}

/**
 * Moving average cost. The item keeps what its stock on hand is worth, and the
 * average is that value divided by the quantity.
 *
 *  - Goods coming in add quantity x their cost to the value.
 *  - Goods going out normally leave at the current average, so selling does not
 *    move the average.
 *  - A reversal (cancelling or editing a purchase, cancelling a batch, a return)
 *    removes the goods at the cost they entered with, so a cancelled typo leaves
 *    no trace in the average.
 *
 * `recordedCost` is the cost stored on the movement; 0 means "use the average".
 */
function nextCost(item, amount, recordedCost) {
  const stock0 = item.stock_quantity;
  const lastCost = item.last_cost_price || 0;
  // Items from before inventory_value existed: value what is on the shelf at the last cost.
  const value0 =
    item.inventory_value === undefined || item.inventory_value === null
      ? Math.max(stock0, 0) * lastCost
      : item.inventory_value;
  const avg0 = stock0 > 0 && value0 > 0 ? value0 / stock0 : lastCost;
  const cost = recordedCost > 0 ? recordedCost : avg0;
  const stock1 = round3(stock0 + amount);

  let value1;
  if (amount > 0) {
    // Receiving goods into a negative count only counts what is left over.
    value1 = stock0 < 0 ? (stock1 > 0 ? stock1 * cost : 0) : value0 + amount * cost;
  } else {
    value1 = stock0 > 0 && stock1 > 0 ? value0 - -amount * cost : 0;
  }

  return { stock1, value1, avg0 };
}

/**
 * Apply a signed change to an item's stock, update its average cost, and append
 * the matching movement row.
 *
 * The stock check and the write are one conditional update keyed on the stock level
 * that was read, so two requests cannot both take the last unit (blocker 06d).
 * If another request got in first the update matches nothing and we read again.
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

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const item = await Item.findByName(shop, item_name, session);
    if (!item) {
      throw new Error(`Item "${item_name}" not found in this shop's catalog`);
    }

    if (amount < 0 && !allowNegative && item.stock_quantity < -amount) {
      throw new InsufficientStockError([
        {
          item_name: item.item_name,
          requested: -amount,
          available: item.stock_quantity,
          short_by: round3(-amount - item.stock_quantity),
        },
      ]);
    }

    const next = nextCost(item, amount, cost_per_unit);
    let value1 = next.value1;
    let avg1 = next.stock1 > 0 && value1 > 0 ? value1 / next.stock1 : next.avg0;

    // A reversal that takes out more value than is left (some of the goods were
    // sold at a wrong cost in between) cannot be answered by the running value.
    if (next.stock1 > 0 && amount < 0 && value1 <= 0) {
      const fallback = await latestValidCost({ shop, item_name: item.item_name, ref_model, ref_id, session });
      if (fallback) {
        avg1 = fallback;
        value1 = next.stock1 * fallback;
      }
    }
    value1 = Math.max(value1, 0);

    const result = await Item.updateOne(
      {
        _id: item._id,
        shop,
        stock_quantity: item.stock_quantity,
        inventory_value: item.inventory_value ?? null,
      },
      {
        $set: {
          stock_quantity: next.stock1,
          inventory_value: round6(value1),
          last_cost_price: round4(avg1),
        },
      },
      session ? { session } : undefined
    );

    if (result.matchedCount === 0) {
      // Someone else moved this item between our read and our write. Read again.
      continue;
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

    return next.stock1;
  }

  throw new Error('This item is being updated by someone else. Please try again.');
}

/**
 * The earliest day this item was ever stocked (first valid purchase or cooking
 * batch). Selling or using it on an earlier date would mean selling goods that
 * had not been bought yet.
 */
async function assertStockedBy(shop, item_name, date_key, session) {
  const name = { $regex: `^${escapeRegex(item_name)}$`, $options: 'i' };
  const opts = session ? { session } : undefined;
  const [purchase, batch] = await Promise.all([
    Purchase.findOne({ shop, item_name: name, voided_at: null }, 'date_key', {
      ...opts,
      sort: { date_key: 1 },
    }).lean(),
    Production.findOne({ shop, dish_name: name, voided_at: null }, 'date_key', {
      ...opts,
      sort: { date_key: 1 },
    }).lean(),
  ]);

  const first = [purchase?.date_key, batch?.date_key].filter(Boolean).sort()[0];
  if (first && date_key < first) {
    throw new BadRequestError(
      `"${item_name}" was first stocked on ${first}, so it cannot be used on an earlier date (${date_key}).`
    );
  }
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
  assertStockedBy,
  findShortfalls,
  moveStock,
  stockFromMovements,
};
