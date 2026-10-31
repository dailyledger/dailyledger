const Credit = require('../models/Credit');
const CreditPayment = require('../models/CreditPayment');
const Shop = require('../models/Shop');
const { dateKeyFor } = require('./shopDay');
const { round2 } = require('./money');

/**
 * Credits used to remember only "paid so far". Payments are now records with a date
 * and a mode, so any credit whose recorded payments fall short of what it says was
 * paid gets one catch-up payment for the difference (dated when it was last updated,
 * mode unknown so recorded as cash). Safe to run on every start: once a credit adds
 * up it is left alone.
 */
async function backfillCreditPayments() {
  const credits = await Credit.find({ amount_paid: { $gt: 0 } })
    .select('shop amount_paid updated_at date')
    .lean();
  if (credits.length === 0) return 0;

  const sums = await CreditPayment.aggregate([
    { $match: { credit_id: { $in: credits.map((c) => c._id) }, voided_at: null } },
    { $group: { _id: '$credit_id', total: { $sum: '$amount' } } },
  ]);
  const recorded = new Map(sums.map((row) => [String(row._id), row.total]));
  const shops = new Map((await Shop.find().lean()).map((s) => [String(s._id), s]));

  const missing = [];
  for (const credit of credits) {
    const gap = round2(credit.amount_paid - (recorded.get(String(credit._id)) || 0));
    if (gap <= 0) continue;
    const shop = shops.get(String(credit.shop));
    const when = credit.updated_at || credit.date || new Date();
    missing.push({
      shop: credit.shop,
      credit_id: credit._id,
      amount: gap,
      kind: 'payment',
      payment_mode: 'cash',
      date: when,
      date_key: dateKeyFor(when, shop?.timezone, shop?.day_start_hour || 0),
      note: 'recorded before payments were tracked individually',
    });
  }

  if (missing.length) await CreditPayment.insertMany(missing);
  return missing.length;
}

module.exports = { backfillCreditPayments };
