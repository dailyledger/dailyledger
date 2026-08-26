/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Shop = require('../models/Shop');
const User = require('../models/User');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');
const { dateKeyFor } = require('../utils/shopDay');
const { round2 } = require('../utils/money');

/**
 * End-to-end check of the six blocker fixes, driven over HTTP against a running
 * server. Expects BASE_URL and a MONGODB_URI pointing at a throwaway database —
 * it creates two shops and drops the database when it finishes.
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5099';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

async function api(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, body: json };
}

async function seedShop(name, username, password) {
  const shop = await Shop.create({ name, timezone: 'Asia/Kolkata', day_start_hour: 0 });
  await User.create({
    username,
    password_hash: await bcrypt.hash(password, 10),
    shop: shop._id,
    role: 'owner',
  });
  return shop;
}

async function login(username, password) {
  const res = await api(null, 'POST', '/api/auth/login', { username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function stockOf(shopId, itemName) {
  const item = await Item.findByName(shopId, itemName);
  return item ? item.stock_quantity : null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Test database: ${mongoose.connection.name}`);
  console.log(`Target server: ${BASE}\n`);

  await mongoose.connection.dropDatabase();

  const shopA = await seedShop('Shop A', 'ownerA', 'passA123');
  const shopB = await seedShop('Shop B', 'ownerB', 'passB123');

  const tokenA = await login('ownerA', 'passA123');
  const tokenB = await login('ownerB', 'passB123');

  // ---------------------------------------------------------------- blocker 04
  section('Blocker 04 — server computes totals, client values ignored');

  const buy = await api(tokenA, 'POST', '/api/purchases', {
    vendor_name: 'Mandi Traders',
    item_name: 'Basmati rice',
    quantity: 2,
    units_per_pack: 50, // two 50kg sacks = 100 kg
    unit_type: 'kg',
    amount: 3000,
    selling_price: 45,
    payment_mode: 'cash',
  });
  check('purchase created', buy.status === 201, JSON.stringify(buy.body));

  const riceStock = await stockOf(shopA._id, 'Basmati rice');
  check('bulk pack converted to 100 stock units', riceStock === 100, `got ${riceStock}`);

  const riceItem = await Item.findByName(shopA._id, 'Basmati rice');
  check('cost per unit = 3000/100 = 30', riceItem.last_cost_price === 30, `got ${riceItem.last_cost_price}`);

  // Client claims the sale is worth ₹1. Server must recompute 3 x 45 = 135.
  const sale1 = await api(tokenA, 'POST', '/api/sales', {
    items: [
      { item_name: 'Basmati rice', unit_type: 'kg', quantity: 3, price_per_unit: 45, line_total: 1 },
    ],
    total_amount: 1,
    payment_mode: 'cash',
  });
  check('sale created', sale1.status === 201, JSON.stringify(sale1.body));
  check(
    'client total_amount of 1 ignored, recomputed to 135',
    sale1.body.total_amount === 135,
    `got ${sale1.body.total_amount}`
  );
  check(
    'client line_total of 1 ignored, recomputed to 135',
    sale1.body.items[0].line_total === 135,
    `got ${sale1.body.items[0].line_total}`
  );

  // Float drift: 100 / 3 is 33.333333333333336 in JS.
  const drift = await api(tokenA, 'POST', '/api/purchases', {
    vendor_name: 'Drift Test',
    item_name: 'Dal',
    quantity: 3,
    unit_type: 'kg',
    amount: 100,
    selling_price: 50,
    payment_mode: 'cash',
  });
  check('drift purchase created', drift.status === 201, JSON.stringify(drift.body));
  const dalItem = await Item.findByName(shopA._id, 'Dal');
  check(
    'cost 100/3 rounded to 33.33 rather than 33.333333333333336',
    dalItem.last_cost_price === 33.33,
    `got ${dalItem.last_cost_price}`
  );

  // ---------------------------------------------------------------- blocker 02
  section('Blocker 02 — cost snapshotted, profit is margin not cash flow');

  check(
    'sale line carries cost_per_unit 30 from the catalog',
    sale1.body.items[0].cost_per_unit === 30,
    `got ${sale1.body.items[0].cost_per_unit}`
  );

  // Overwrite the catalog cost with a later, more expensive purchase.
  await api(tokenA, 'POST', '/api/purchases', {
    vendor_name: 'Mandi Traders',
    item_name: 'Basmati rice',
    quantity: 1,
    units_per_pack: 50,
    unit_type: 'kg',
    amount: 4000, // 80/kg now
    selling_price: 95,
    payment_mode: 'cash',
  });
  const riceAfter = await Item.findByName(shopA._id, 'Basmati rice');
  check('catalog cost updated to 80', riceAfter.last_cost_price === 80, `got ${riceAfter.last_cost_price}`);

  const saleReread = await api(tokenA, 'GET', `/api/sales/${sale1.body._id}`);
  check(
    'the earlier sale still remembers it cost 30 (history not rewritten)',
    saleReread.body.items[0].cost_per_unit === 30,
    `got ${saleReread.body.items[0].cost_per_unit}`
  );

  const dash = await api(tokenA, 'GET', '/api/dashboard/summary?period=day');
  // Revenue 135, COGS 3 x 30 = 90, so gross profit 45.
  check('dashboard revenue = 135', dash.body.revenue === 135, `got ${dash.body.revenue}`);
  check('dashboard COGS = 90', dash.body.cost_of_goods_sold === 90, `got ${dash.body.cost_of_goods_sold}`);
  check('dashboard gross profit = 45', dash.body.gross_profit === 45, `got ${dash.body.gross_profit}`);
  check(
    'profit is NOT the old sales-minus-purchases figure (would be -6900)',
    dash.body.gross_profit !== round2(135 - 7000),
    `got ${dash.body.gross_profit}`
  );
  check(
    'cash flow still reported separately',
    dash.body.cash_flow === round2(135 - 7100),
    `got ${dash.body.cash_flow}`
  );

  // ---------------------------------------------------------------- blocker 03
  section('Blocker 03 — editing an entry corrects stock');

  const beforeEdit = await stockOf(shopA._id, 'Basmati rice');
  const edit = await api(tokenA, 'PUT', `/api/sales/${sale1.body._id}`, {
    items: [
      { item_name: 'Basmati rice', unit_type: 'kg', quantity: 2, price_per_unit: 45 },
    ],
    payment_mode: 'cash',
  });
  check('sale edited 3kg -> 2kg', edit.status === 200, JSON.stringify(edit.body));

  const afterEdit = await stockOf(shopA._id, 'Basmati rice');
  check(
    'the 1kg difference went back to stock',
    afterEdit === round2(beforeEdit + 1),
    `before ${beforeEdit}, after ${afterEdit}`
  );
  check('sale total recomputed to 90', edit.body.total_amount === 90, `got ${edit.body.total_amount}`);

  // Spoilage edit — the same bug existed here.
  const spoil = await api(tokenA, 'POST', '/api/spoilage', {
    item_name: 'Dal',
    unit_type: 'kg',
    quantity: 1,
    reason: 'expired',
  });
  check('spoilage created', spoil.status === 201, JSON.stringify(spoil.body));
  check(
    'spoilage valued from cost (1 x 33.33)',
    spoil.body.estimated_value === 33.33,
    `got ${spoil.body.estimated_value}`
  );

  const dalBefore = await stockOf(shopA._id, 'Dal');
  await api(tokenA, 'PUT', `/api/spoilage/${spoil.body._id}`, {
    item_name: 'Dal',
    unit_type: 'kg',
    quantity: 2,
    reason: 'expired',
  });
  const dalAfter = await stockOf(shopA._id, 'Dal');
  check(
    'spoilage edit 1kg -> 2kg took one more from stock',
    dalAfter === round2(dalBefore - 1),
    `before ${dalBefore}, after ${dalAfter}`
  );

  // ---------------------------------------------------------------- blocker 05
  section('Blocker 05 — date_key is the shop day in IST, not UTC');

  const nowKeyIST = dateKeyFor(new Date(), 'Asia/Kolkata', 0);
  check(
    `sale stamped with IST business day ${nowKeyIST}`,
    sale1.body.date_key === nowKeyIST,
    `got ${sale1.body.date_key}`
  );

  // A 7pm IST sale must not land on the next day. 19:30 IST = 14:00 UTC.
  const eveningUtc = new Date('2026-08-25T14:00:00.000Z');
  const eveningSale = await api(tokenA, 'POST', '/api/sales', {
    items: [{ item_name: 'Dal', unit_type: 'kg', quantity: 1, price_per_unit: 50 }],
    payment_mode: 'cash',
    date: eveningUtc.toISOString(),
  });
  check(
    '19:30 IST sale is filed under 2026-08-25, not 08-26',
    eveningSale.body.date_key === '2026-08-25',
    `got ${eveningSale.body.date_key}`
  );

  const ranged = await api(tokenA, 'GET', '/api/sales?from=2026-08-25&to=2026-08-25');
  check(
    'date range filter finds the evening sale',
    ranged.body.some((s) => s._id === eveningSale.body._id),
    `${ranged.body.length} sale(s) in range`
  );

  const badRange = await api(tokenA, 'GET', '/api/sales?from=not-a-date');
  check('malformed date range rejected', badRange.status === 400, `got ${badRange.status}`);

  // ---------------------------------------------------------------- blocker 06b
  section('Blocker 06b — over-stock sale warns and can be confirmed');

  const dalStock = await stockOf(shopA._id, 'Dal');
  const tooMuch = await api(tokenA, 'POST', '/api/sales', {
    items: [
      { item_name: 'Dal', unit_type: 'kg', quantity: dalStock + 5, price_per_unit: 50 },
    ],
    payment_mode: 'cash',
  });
  check('over-stock sale returns 409, not a hard rejection', tooMuch.status === 409, `got ${tooMuch.status}`);
  check('response is marked confirmable', tooMuch.body.confirmable === true);
  check('response names the shortfall', Array.isArray(tooMuch.body.shortfalls) && tooMuch.body.shortfalls.length === 1);

  const confirmed = await api(tokenA, 'POST', '/api/sales', {
    items: [
      { item_name: 'Dal', unit_type: 'kg', quantity: dalStock + 5, price_per_unit: 50 },
    ],
    payment_mode: 'cash',
    allow_negative: true,
  });
  check('confirming saves the sale', confirmed.status === 201, JSON.stringify(confirmed.body));
  check('the sale records why it was allowed', Boolean(confirmed.body.stock_warning));

  const negStock = await stockOf(shopA._id, 'Dal');
  check('stock is now negative, flagging the missing entry', negStock === -5, `got ${negStock}`);

  const itemsList = await api(tokenA, 'GET', '/api/items');
  const dalRow = itemsList.body.find((i) => i.item_name === 'Dal');
  check('inventory flags the item for review', dalRow.needs_review === true);

  // ---------------------------------------------------------------- blocker 06c
  section('Blocker 06c — double-tap does not create two sales');

  const key = 'test-idem-key-0001';
  const first = await api(
    tokenA,
    'POST',
    '/api/sales',
    { items: [{ item_name: 'Basmati rice', unit_type: 'kg', quantity: 1, price_per_unit: 45 }], payment_mode: 'cash' },
    { 'Idempotency-Key': key }
  );
  const second = await api(
    tokenA,
    'POST',
    '/api/sales',
    { items: [{ item_name: 'Basmati rice', unit_type: 'kg', quantity: 1, price_per_unit: 45 }], payment_mode: 'cash' },
    { 'Idempotency-Key': key }
  );

  check('first submission creates the sale', first.status === 201, `got ${first.status}`);
  check('second submission returns 200, not a new sale', second.status === 200, `got ${second.status}`);
  check('both responses are the same record', first.body._id === second.body._id);

  const dupCount = await Sale.countDocuments({ shop: shopA._id, idempotency_key: key });
  check('exactly one sale stored for that key', dupCount === 1, `got ${dupCount}`);

  // Concurrent double-tap, not just sequential.
  const raceKey = 'test-idem-race-0002';
  const raceBody = {
    items: [{ item_name: 'Basmati rice', unit_type: 'kg', quantity: 1, price_per_unit: 45 }],
    payment_mode: 'cash',
  };
  await Promise.all([
    api(tokenA, 'POST', '/api/sales', raceBody, { 'Idempotency-Key': raceKey }),
    api(tokenA, 'POST', '/api/sales', raceBody, { 'Idempotency-Key': raceKey }),
  ]);
  const raceCount = await Sale.countDocuments({ shop: shopA._id, idempotency_key: raceKey });
  check('simultaneous duplicate submissions store one sale', raceCount === 1, `got ${raceCount}`);

  // ---------------------------------------------------------------- blocker 06a
  section('Blocker 06a — entries can be cancelled and stock comes back');

  const riceBeforeVoid = await stockOf(shopA._id, 'Basmati rice');
  const voidRes = await api(tokenA, 'DELETE', `/api/sales/${first.body._id}`, {
    reason: 'entered twice by mistake',
  });
  check('sale cancelled', voidRes.status === 200, JSON.stringify(voidRes.body));

  const riceAfterVoid = await stockOf(shopA._id, 'Basmati rice');
  check(
    'the cancelled sale returned its 1kg to stock',
    riceAfterVoid === round2(riceBeforeVoid + 1),
    `before ${riceBeforeVoid}, after ${riceAfterVoid}`
  );

  const listAfterVoid = await api(tokenA, 'GET', '/api/sales');
  check(
    'cancelled sale no longer appears in the list',
    !listAfterVoid.body.some((s) => s._id === first.body._id)
  );

  const stillThere = await Sale.findById(first.body._id);
  check('but the record still exists in the database', Boolean(stillThere));
  check('and records who cancelled it', stillThere.voided_by === 'ownerA', `got ${stillThere.voided_by}`);

  const doubleVoid = await api(tokenA, 'DELETE', `/api/sales/${first.body._id}`);
  check('cancelling twice is rejected', doubleVoid.status === 400, `got ${doubleVoid.status}`);

  // ---------------------------------------------------------------- blocker 06d
  section('Blocker 06d — multi-item writes are all-or-nothing');

  const riceBeforeFail = await stockOf(shopA._id, 'Basmati rice');
  // Second line names an item that does not exist, so the whole sale must fail
  // without the first line's stock having moved.
  const partial = await api(tokenA, 'POST', '/api/sales', {
    items: [
      { item_name: 'Basmati rice', unit_type: 'kg', quantity: 1, price_per_unit: 45 },
      { item_name: 'Nonexistent item', unit_type: 'kg', quantity: 1, price_per_unit: 10 },
    ],
    payment_mode: 'cash',
  });
  check('sale with an unknown item is rejected', partial.status === 400, `got ${partial.status}`);

  const riceAfterFail = await stockOf(shopA._id, 'Basmati rice');
  check(
    'no stock was deducted for the valid line',
    riceAfterFail === riceBeforeFail,
    `before ${riceBeforeFail}, after ${riceAfterFail}`
  );

  // ---------------------------------------------------------------- blocker 01
  section('Blocker 01 — shops cannot see each other');

  await api(tokenB, 'POST', '/api/purchases', {
    vendor_name: 'Other Vendor',
    item_name: 'Basmati rice', // same name, different shop
    quantity: 10,
    unit_type: 'kg',
    amount: 500,
    selling_price: 60,
    payment_mode: 'cash',
  });

  const itemsA = await api(tokenA, 'GET', '/api/items');
  const itemsB = await api(tokenB, 'GET', '/api/items');
  check('both shops can hold an item called "Basmati rice"', itemsB.body.some((i) => i.item_name === 'Basmati rice'));

  const riceA = itemsA.body.find((i) => i.item_name === 'Basmati rice');
  const riceB = itemsB.body.find((i) => i.item_name === 'Basmati rice');
  check('their stock counts are independent', riceA.stock_quantity !== riceB.stock_quantity, `A ${riceA.stock_quantity}, B ${riceB.stock_quantity}`);
  check('shop B has 10kg of its own', riceB.stock_quantity === 10, `got ${riceB.stock_quantity}`);

  const salesB = await api(tokenB, 'GET', '/api/sales');
  check("shop B sees none of shop A's sales", salesB.body.length === 0, `got ${salesB.body.length}`);

  const crossRead = await api(tokenB, 'GET', `/api/sales/${sale1.body._id}`);
  check("shop B cannot fetch shop A's sale by id", crossRead.status === 404, `got ${crossRead.status}`);

  const crossVoid = await api(tokenB, 'DELETE', `/api/sales/${sale1.body._id}`);
  check("shop B cannot cancel shop A's sale", crossVoid.status === 404, `got ${crossVoid.status}`);

  const dashB = await api(tokenB, 'GET', '/api/dashboard/summary?period=day');
  check("shop B's dashboard excludes shop A's revenue", dashB.body.revenue === 0, `got ${dashB.body.revenue}`);

  const noAuth = await api(null, 'GET', '/api/sales');
  check('unauthenticated request rejected', noAuth.status === 401, `got ${noAuth.status}`);

  // ---------------------------------------------------------- ledger integrity
  section('Stock ledger integrity');

  const allItems = await Item.find({ shop: shopA._id });
  let inSync = true;
  const drifts = [];
  for (const item of allItems) {
    const rows = await StockMovement.aggregate([
      { $match: { shop: item.shop, item_name: item.item_name } },
      { $group: { _id: null, total: { $sum: '$delta' } } },
    ]);
    const computed = rows.length ? round2(rows[0].total) : 0;
    if (round2(item.stock_quantity) !== computed) {
      inSync = false;
      drifts.push(`${item.item_name}: cached ${item.stock_quantity} vs ledger ${computed}`);
    }
  }
  check('every item matches its movement log', inSync, drifts.join('; '));

  const movements = await StockMovement.countDocuments({ shop: shopA._id });
  check('movements were recorded', movements > 0, `got ${movements}`);

  // ------------------------------------------------------------------- results
  console.log(`\n${'='.repeat(52)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log(`\n  Failures:`);
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log('='.repeat(52));

  await mongoose.connection.dropDatabase();
  console.log('\nTest database dropped.');
  await mongoose.disconnect();

  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nTest run crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
