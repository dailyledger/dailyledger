require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const { round3 } = require('../utils/money');
const { dateKeyFor, DEFAULT_TIMEZONE } = require('../utils/shopDay');
const Shop = require('../models/Shop');

/**
 * Compares each item's cached stock_quantity against the sum of its movement log.
 *
 * Two ways to close a gap, and which one is right depends on who is wrong:
 *
 *   --fix        The movement log is the truth and the cache drifted. Resets the
 *                cache from the ledger. This is the normal case once everything
 *                is running on the current code, since every write appends a
 *                movement inside the same transaction.
 *
 *   --reconcile  The cache is the truth and the ledger is incomplete — the case
 *                straight after migrating, where entries made under the old code
 *                changed stock without recording a movement. Appends an explicit
 *                adjustment row so the ledger agrees, leaving a visible marker
 *                rather than silently rewriting the count.
 *
 * With no flag it only reports.
 */
async function main() {
  const fix = process.argv.includes('--fix');
  const reconcile = process.argv.includes('--reconcile');

  if (fix && reconcile) {
    console.error('Pass either --fix or --reconcile, not both.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const shops = new Map();
  for (const shop of await Shop.find()) {
    shops.set(String(shop._id), shop);
  }

  const items = await Item.find().sort({ item_name: 1 });
  let drifted = 0;

  for (const item of items) {
    const rows = await StockMovement.aggregate([
      { $match: { shop: item.shop, item_name: item.item_name } },
      { $group: { _id: null, total: { $sum: '$delta' } } },
    ]);

    const ledger = rows.length ? round3(rows[0].total) : 0;
    const cached = round3(item.stock_quantity);

    if (ledger === cached) continue;

    drifted += 1;
    const gap = round3(cached - ledger);
    console.log(`DRIFT  ${item.item_name}: cached ${cached}, ledger ${ledger} (gap ${gap})`);

    if (fix) {
      await Item.updateOne({ _id: item._id }, { $set: { stock_quantity: ledger } });
      console.log(`       cache reset to ${ledger}`);
    }

    if (reconcile) {
      const shop = shops.get(String(item.shop));
      const timezone = shop ? shop.timezone : DEFAULT_TIMEZONE;
      const dayStart = shop ? shop.day_start_hour : 0;

      await StockMovement.create({
        shop: item.shop,
        item_name: item.item_name,
        delta: gap,
        reason: 'adjustment',
        cost_per_unit: round3(item.last_cost_price),
        note: 'reconciled against stock recorded before the movement log existed',
        date: new Date(),
        date_key: dateKeyFor(new Date(), timezone, dayStart),
      });
      console.log(`       adjustment of ${gap} appended to the ledger`);
    }
  }

  if (drifted === 0) {
    console.log(`All ${items.length} item(s) match their movement log.`);
  } else if (!fix && !reconcile) {
    console.log(
      `\n${drifted} item(s) drifted. Re-run with --reconcile if the current stock count is ` +
        `right and the log is just incomplete, or --fix if the log is right and the count drifted.`
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
