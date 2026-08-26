/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const { round2 } = require('../utils/money');
const { dateKeyFor } = require('../utils/shopDay');

/** Covers the six issues found in the QA pass. */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5099';
let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(t) {
  console.log(`\n${t}`);
  console.log('-'.repeat(t.length));
}

let token;
async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { s: r.status, b: j };
}

const stockOf = async (shop, name) => {
  const it = await Item.findByName(shop, name);
  return it ? it.stock_quantity : null;
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.dropDatabase();

  const shop = await Shop.create({ name: 'QA Shop', timezone: 'Asia/Kolkata', day_start_hour: 0 });
  await User.create({
    username: 'qa', password_hash: await bcrypt.hash('qapass', 10), shop: shop._id, role: 'owner',
  });
  token = (await api('POST', '/api/auth/login', { username: 'qa', password: 'qapass' })).b.token;

  const buy = (name, qty, rate, unit = 'kg', extra = {}) =>
    api('POST', '/api/purchases', {
      vendor_name: 'V', item_name: name, quantity: qty, unit_type: unit,
      rate, selling_price: rate * 1.5, payment_mode: 'cash', ...extra,
    });

  // ------------------------------------------------------- 1: return dead end
  section('Fix 1 — a return can be undone, unlocking its entry');

  const p = (await buy('Soap', 5, 20, 'piece')).b;
  const pr = await api('POST', `/api/purchases/${p._id}/return`, { quantity: 2 });
  check('purchase return created', pr.s === 201, JSON.stringify(pr.b));
  check('stock dropped to 3', (await stockOf(shop._id, 'Soap')) === 3);

  check('edit still blocked while the return stands',
    (await api('PUT', `/api/purchases/${p._id}`, {
      vendor_name: 'V', item_name: 'Soap', quantity: 6, unit_type: 'piece', rate: 20, payment_mode: 'cash',
    })).s === 400);

  const undo = await api('DELETE', `/api/purchases/${p._id}/return/${pr.b._id}`);
  check('undo the purchase return', undo.s === 200, JSON.stringify(undo.b));
  check('stock back to 5', (await stockOf(shop._id, 'Soap')) === 5);
  check('undoing twice is refused',
    (await api('DELETE', `/api/purchases/${p._id}/return/${pr.b._id}`)).s === 400);

  const editNow = await api('PUT', `/api/purchases/${p._id}`, {
    vendor_name: 'V', item_name: 'Soap', quantity: 6, unit_type: 'piece', rate: 20, payment_mode: 'cash',
  });
  check('purchase is editable again', editNow.s === 200, JSON.stringify(editNow.b));
  check('cancel works again too', (await api('DELETE', `/api/purchases/${p._id}`, { reason: 'qa' })).s === 200);

  // sales side
  const p2 = (await buy('Rice', 20, 50)).b;
  const s1 = (await api('POST', '/api/sales', {
    items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 5, price_per_unit: 75 }], payment_mode: 'cash',
  })).b;
  const sr = await api('POST', `/api/sales/${s1._id}/return`, { item_name: 'Rice', quantity: 2 });
  check('sales return created', sr.s === 201);
  check('stock 15 -> 17 after return', (await stockOf(shop._id, 'Rice')) === 17);

  check('sale edit blocked while return stands',
    (await api('PUT', `/api/sales/${s1._id}`, {
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 6, price_per_unit: 75 }], payment_mode: 'cash',
    })).s === 400);

  const undoS = await api('DELETE', `/api/sales/${s1._id}/return/${sr.b._id}`);
  check('undo the sales return', undoS.s === 200, JSON.stringify(undoS.b));
  check('stock back to 15', (await stockOf(shop._id, 'Rice')) === 15);
  check('sale editable again',
    (await api('PUT', `/api/sales/${s1._id}`, {
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 6, price_per_unit: 75 }], payment_mode: 'cash',
    })).s === 200);

  // undoing a sales return when the goods were re-sold must warn, not silently go negative
  const p3 = (await buy('Tea', 5, 100)).b;
  const s2 = (await api('POST', '/api/sales', {
    items: [{ item_name: 'Tea', unit_type: 'kg', quantity: 2, price_per_unit: 150 }], payment_mode: 'cash',
  })).b;
  const sr2 = (await api('POST', `/api/sales/${s2._id}/return`, { item_name: 'Tea', quantity: 2 })).b;
  // sell everything, so undoing the return would go negative
  await api('POST', '/api/sales', {
    items: [{ item_name: 'Tea', unit_type: 'kg', quantity: 5, price_per_unit: 150 }], payment_mode: 'cash',
  });
  const clash = await api('DELETE', `/api/sales/${s2._id}/return/${sr2._id}`);
  check('undo that would go negative asks first (409)', clash.s === 409, `got ${clash.s}`);
  check('and is confirmable', clash.b && clash.b.confirmable === true);
  const forced = await api('DELETE', `/api/sales/${s2._id}/return/${sr2._id}`, { allow_negative: true });
  check('confirming it goes through', forced.s === 200, JSON.stringify(forced.b));
  check('stock is now negative', (await stockOf(shop._id, 'Tea')) === -2);

  // ------------------------------------------------------------ 2: back-dating
  section('Fix 2 — back-dating works, future dates refused');

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const back = await api('POST', '/api/sales', {
    items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 }],
    payment_mode: 'cash', date: yesterday.toISOString(),
  });
  const expectKey = dateKeyFor(yesterday, 'Asia/Kolkata', 0);
  check('a sale can be dated yesterday', back.s === 201, JSON.stringify(back.b));
  check(`filed under ${expectKey}`, back.b.date_key === expectKey, `got ${back.b && back.b.date_key}`);

  const inRange = await api('GET', `/api/sales?from=${expectKey}&to=${expectKey}`);
  check("yesterday's report finds it", inRange.b.some((x) => x._id === back.b._id));
  const todayKeyNow = dateKeyFor(new Date(), 'Asia/Kolkata', 0);
  const todayList = await api('GET', `/api/sales?from=${todayKeyNow}&to=${todayKeyNow}`);
  check("today's report does NOT include it", !todayList.b.some((x) => x._id === back.b._id));

  const future = await api('POST', '/api/sales', {
    items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 }],
    payment_mode: 'cash', date: '2030-01-01T10:00:00.000Z',
  });
  check('year 2030 refused', future.s === 400, `got ${future.s}`);
  check('with a clear reason', /future/i.test(future.b.error || ''), future.b.error);

  const ancient = await api('POST', '/api/sales', {
    items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 }],
    payment_mode: 'cash', date: '2019-05-01T10:00:00.000Z',
  });
  check('year 2019 refused (too far back)', ancient.s === 400, `got ${ancient.s}`);

  check('back-dated purchase also works',
    (await buy('Ghee', 2, 500, 'litre', { date: yesterday.toISOString() })).s === 201);
  check('back-dated spoilage also works',
    (await api('POST', '/api/spoilage', {
      item_name: 'Ghee', unit_type: 'litre', quantity: 1, reason: 'expired', date: yesterday.toISOString(),
    })).s === 201);

  // ------------------------------------------------------ 3: purchase list qty
  section('Fix 3 — purchases list reports the quantity bought');

  const p4 = (await buy('Sugar', 20, 40)).b;
  await api('POST', `/api/purchases/${p4._id}/return`, { quantity: 3 });
  const list = await api('GET', '/api/purchases');
  const row = list.b.find((x) => x._id === p4._id);
  check('quantity stays 20 (what was bought)', row.quantity === 20, `got ${row.quantity}`);
  check('returned_quantity is 3', row.returned_quantity === 3, `got ${row.returned_quantity}`);
  check('net_quantity still available for totals', row.net_quantity === 17, `got ${row.net_quantity}`);

  // ------------------------------------------------------------- 4: name limit
  section('Fix 4 — item and party names are bounded');

  check('61-char item name refused',
    (await buy('X'.repeat(61), 1, 10, 'piece')).s === 400);
  check('60-char item name allowed',
    (await buy('Y'.repeat(60), 1, 10, 'piece')).s === 201);
  check('81-char vendor name refused',
    (await api('POST', '/api/purchases', {
      vendor_name: 'V'.repeat(81), item_name: 'Rice', quantity: 1, unit_type: 'kg',
      rate: 50, selling_price: 75, payment_mode: 'cash',
    })).s === 400);
  check('long customer name refused',
    (await api('POST', '/api/credits', {
      customer_name: 'C'.repeat(81),
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 }],
    })).s === 400);

  // ------------------------------------------------------- 5: duplicate lines
  section('Fix 5 — exact duplicate lines refused, different prices allowed');

  const dupSame = await api('POST', '/api/sales', {
    items: [
      { item_name: 'Rice', unit_type: 'kg', quantity: 2, price_per_unit: 75 },
      { item_name: 'Rice', unit_type: 'kg', quantity: 2, price_per_unit: 75 },
    ], payment_mode: 'cash',
  });
  check('same item at same price refused', dupSame.s === 400, `got ${dupSame.s}`);
  check('message says to combine', /combine/i.test(dupSame.b.error || ''), dupSame.b.error);

  const dupDiff = await api('POST', '/api/sales', {
    items: [
      { item_name: 'Rice', unit_type: 'kg', quantity: 2, price_per_unit: 75 },
      { item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 60, bargained: true },
    ], payment_mode: 'cash',
  });
  check('same item at DIFFERENT prices still allowed', dupDiff.s === 201, JSON.stringify(dupDiff.b));
  check('total = 150 + 60 = 210', dupDiff.b.total_amount === 210, `got ${dupDiff.b.total_amount}`);
  check('duplicate refused on credits too',
    (await api('POST', '/api/credits', {
      customer_name: 'C', items: [
        { item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 },
        { item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 75 },
      ],
    })).s === 400);

  // ------------------------------------------------------------- 6: sane caps
  section('Fix 6 — absurd amounts refused');

  check('price 999999999999 refused',
    (await api('POST', '/api/sales', {
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 999999999999 }],
      payment_mode: 'cash', allow_negative: true,
    })).s === 400);
  check('price at the 1 crore ceiling allowed',
    (await api('POST', '/api/sales', {
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 1, price_per_unit: 10000000 }],
      payment_mode: 'cash', allow_negative: true,
    })).s === 201);
  check('rate 999999999999 refused', (await buy('Gold', 1, 999999999999, 'piece')).s === 400);
  check('quantity 2 million refused',
    (await api('POST', '/api/sales', {
      items: [{ item_name: 'Rice', unit_type: 'kg', quantity: 2000000, price_per_unit: 10 }],
      payment_mode: 'cash', allow_negative: true,
    })).s === 400);
  check('spoilage quantity 2 million refused',
    (await api('POST', '/api/spoilage', {
      item_name: 'Rice', unit_type: 'kg', quantity: 2000000, reason: 'damaged', allow_negative: true,
    })).s === 400);

  // ---------------------------------------------------------- ledger integrity
  section('Stock ledger still reconciles');

  let drift = [];
  for (const item of await Item.find({ shop: shop._id })) {
    const rows = await StockMovement.aggregate([
      { $match: { shop: item.shop, item_name: item.item_name } },
      { $group: { _id: null, total: { $sum: '$delta' } } },
    ]);
    const ledger = rows.length ? round2(rows[0].total) : 0;
    if (round2(item.stock_quantity) !== ledger) {
      drift.push(`${item.item_name}: ${item.stock_quantity} vs ${ledger}`);
    }
  }
  check('every item matches its movement log', drift.length === 0, drift.join('; '));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) failures.forEach((f) => console.log(`    - ${f}`));
  console.log('='.repeat(50));

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('crashed:', e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
