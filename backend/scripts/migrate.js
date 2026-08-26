require('dotenv').config();
const mongoose = require('mongoose');

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
const { dateKeyFor, DEFAULT_TIMEZONE } = require('../utils/shopDay');
const { round2 } = require('../utils/money');

/**
 * Backfills records written before the six-blocker fixes:
 *
 *   - creates a Shop and attaches every existing record to it (blocker 01)
 *   - stamps date_key on every transaction, in the shop's zone (blocker 05)
 *   - fills cost_per_unit on sale/credit lines from the item's last known cost
 *     (blocker 02 — an approximation, since the true historical cost was never
 *     recorded; new records capture it correctly)
 *   - seeds the stock movement log from current balances so the ledger has an
 *     opening position to build on (blocker 03)
 *
 * Safe to run repeatedly: every step skips records it has already handled.
 */
async function main() {
  const { MONGODB_URI, SHOP_NAME, SHOP_TIMEZONE } = process.env;

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to', mongoose.connection.name);

  const timezone = SHOP_TIMEZONE || DEFAULT_TIMEZONE;

  let shop = await Shop.findOne().sort({ created_at: 1 });
  if (!shop) {
    shop = await Shop.create({
      name: SHOP_NAME || 'My Shop',
      timezone,
      day_start_hour: 0,
    });
    console.log(`Created shop "${shop.name}" (${shop._id}) in ${timezone}`);
  } else {
    console.log(`Using existing shop "${shop.name}" (${shop._id})`);
  }

  const userResult = await User.updateMany(
    { shop: { $exists: false } },
    { $set: { shop: shop._id, role: 'owner' } }
  );
  console.log(`Users linked to shop: ${userResult.modifiedCount}`);

  // Attach every collection to the shop.
  for (const Model of [Item, Sale, Purchase, Credit, Spoilage, SalesReturn, PurchaseReturn]) {
    const result = await Model.updateMany(
      { shop: { $exists: false } },
      { $set: { shop: shop._id } }
    );
    if (result.modifiedCount) {
      console.log(`${Model.modelName}: attached ${result.modifiedCount} record(s) to the shop`);
    }
  }

  // Stamp date_key from each record's existing timestamp.
  for (const Model of [Sale, Purchase, Credit, Spoilage, SalesReturn, PurchaseReturn]) {
    const pending = await Model.find({
      $or: [{ date_key: { $exists: false } }, { date_key: null }],
    });

    for (const doc of pending) {
      doc.date_key = dateKeyFor(doc.date || doc._id.getTimestamp(), timezone, shop.day_start_hour);
      await doc.save({ validateBeforeSave: false });
    }

    if (pending.length) {
      console.log(`${Model.modelName}: stamped date_key on ${pending.length} record(s)`);
    }
  }

  // Approximate historical costs from the catalog's last known cost price.
  const itemCosts = new Map();
  for (const item of await Item.find({ shop: shop._id })) {
    itemCosts.set(item.item_name.toLowerCase(), round2(item.last_cost_price));
  }

  for (const Model of [Sale, Credit]) {
    let touched = 0;
    for (const doc of await Model.find({ shop: shop._id })) {
      let changed = false;
      for (const line of doc.items) {
        // Records written before the fix have no cost at all. Mongoose hydrates
        // the missing path to the schema default of 0, so a falsy value — not
        // just undefined — is what marks a line as needing backfill. A line whose
        // item has no known cost either stays at 0 and is left alone.
        const knownCost = itemCosts.get(line.item_name.toLowerCase()) || 0;
        if (!line.cost_per_unit && knownCost) {
          line.cost_per_unit = knownCost;
          changed = true;
        }
      }
      if (changed) {
        await doc.save({ validateBeforeSave: false });
        touched += 1;
      }
    }
    if (touched) {
      console.log(
        `${Model.modelName}: filled cost_per_unit on ${touched} record(s) ` +
          `(approximated from last known cost)`
      );
    }
  }

  // "spoiled" was removed as a reason: it overlapped with "expired", since goods
  // going bad over time is the same event under either label. "damaged" is kept
  // for physical damage, which is a different cause.
  const reasonResult = await Spoilage.updateMany(
    { reason: 'spoiled' },
    { $set: { reason: 'expired' } }
  );
  if (reasonResult.modifiedCount) {
    console.log(`Spoilage: moved ${reasonResult.modifiedCount} "spoiled" record(s) to "expired"`);
  }

  // Give the movement log an opening balance so future changes are traceable.
  //
  // Checked per item, not per shop: an earlier version gated this on the shop
  // having zero movements, which meant any item created between two runs never
  // got an opening balance and showed up as drift in verifyStock.js forever.
  const items = await Item.find({ shop: shop._id });
  const openingKey = dateKeyFor(new Date(), timezone, shop.day_start_hour);
  const rows = [];

  for (const item of items) {
    if (item.stock_quantity === 0) continue;

    const seen = await StockMovement.countDocuments({
      shop: shop._id,
      item_name: item.item_name,
    });
    if (seen > 0) continue;

    rows.push({
      shop: shop._id,
      item_name: item.item_name,
      delta: item.stock_quantity,
      reason: 'adjustment',
      cost_per_unit: round2(item.last_cost_price),
      note: 'opening balance recorded during migration',
      date: new Date(),
      date_key: openingKey,
    });
  }

  if (rows.length) {
    await StockMovement.insertMany(rows);
    console.log(`Stock movements: wrote ${rows.length} opening balance row(s)`);
  } else {
    console.log('Stock movements: every item already has history, no opening balances needed');
  }

  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  console.log('Indexes ensured');

  console.log('\nMigration complete.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
