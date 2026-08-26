/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Item = require('../models/Item');

/** Checks that Total Amount is quantity x rate, computed by the server. */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5099';
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.dropDatabase();

  const shop = await Shop.create({ name: 'Rate Shop', timezone: 'Asia/Kolkata' });
  await User.create({
    username: 'rateowner',
    password_hash: await bcrypt.hash('ratepass1', 10),
    shop: shop._id,
    role: 'owner',
  });

  const auth = await api(null, 'POST', '/api/auth/login', {
    username: 'rateowner',
    password: 'ratepass1',
  });
  const token = auth.body.token;

  console.log('\nRate x quantity = total');
  console.log('-----------------------');

  // 12 kg at 40/kg = 480
  const simple = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor A',
    item_name: 'Onion',
    quantity: 12,
    unit_type: 'kg',
    rate: 40,
    selling_price: 55,
    payment_mode: 'cash',
  });
  check('purchase accepted with rate only', simple.status === 201, JSON.stringify(simple.body));
  check('total = 12 x 40 = 480', simple.body.amount === 480, `got ${simple.body.amount}`);
  check('rate stored as 40', simple.body.rate === 40, `got ${simple.body.rate}`);

  const onion = await Item.findByName(shop._id, 'Onion');
  check('stock is 12 kg', onion.stock_quantity === 12, `got ${onion.stock_quantity}`);
  check('cost per kg is 40', onion.last_cost_price === 40, `got ${onion.last_cost_price}`);

  console.log('\nPacks: rate is per pack, cost per unit divides it out');
  console.log('----------------------------------------------------');

  // 3 sacks at 1500/sack = 4500 total; each sack is 50 kg, so 150 kg at 30/kg
  const packs = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Mandi',
    item_name: 'Rice',
    quantity: 3,
    units_per_pack: 50,
    unit_type: 'kg',
    rate: 1500,
    selling_price: 45,
    payment_mode: 'cash',
  });
  check('pack purchase accepted', packs.status === 201, JSON.stringify(packs.body));
  check('total = 3 x 1500 = 4500', packs.body.amount === 4500, `got ${packs.body.amount}`);

  const rice = await Item.findByName(shop._id, 'Rice');
  check('stock is 150 kg (3 x 50)', rice.stock_quantity === 150, `got ${rice.stock_quantity}`);
  check('cost per kg is 4500/150 = 30', rice.last_cost_price === 30, `got ${rice.last_cost_price}`);

  console.log('\nServer ignores a client-sent total');
  console.log('----------------------------------');

  // Client claims the total is 1. Server must use 5 x 20 = 100.
  const lying = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor B',
    item_name: 'Potato',
    quantity: 5,
    unit_type: 'kg',
    rate: 20,
    amount: 1,
    selling_price: 30,
    payment_mode: 'cash',
  });
  check('total recomputed to 100, not 1', lying.body.amount === 100, `got ${lying.body.amount}`);

  console.log('\nRounding');
  console.log('--------');

  // A rate of 33.333 is stored as 33.33, so the total must be 3 x 33.33 = 99.99.
  // Multiplying the unrounded rate would give 100 and the stored rate would then
  // not multiply out to the stored total — the bill would not add up.
  const rounded = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor C',
    item_name: 'Sugar',
    quantity: 3,
    unit_type: 'kg',
    rate: 33.333,
    selling_price: 45,
    payment_mode: 'cash',
  });
  check('rate stored rounded to 33.33', rounded.body.rate === 33.33, `got ${rounded.body.rate}`);
  check(
    'total agrees with the stored rate (3 x 33.33 = 99.99)',
    rounded.body.amount === 99.99,
    `got ${rounded.body.amount}`
  );
  check(
    'rate x quantity always reproduces the total',
    Number((rounded.body.rate * rounded.body.quantity).toFixed(2)) === rounded.body.amount
  );

  console.log('\nValidation and backward compatibility');
  console.log('-------------------------------------');

  const noRate = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor D',
    item_name: 'Dal',
    quantity: 5,
    unit_type: 'kg',
    selling_price: 30,
    payment_mode: 'cash',
  });
  check('missing rate rejected', noRate.status === 400, `got ${noRate.status}`);

  const zeroRate = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor D',
    item_name: 'Dal',
    quantity: 5,
    unit_type: 'kg',
    rate: 0,
    selling_price: 30,
    payment_mode: 'cash',
  });
  check('zero rate rejected', zeroRate.status === 400, `got ${zeroRate.status}`);

  // An older client that only knows about amount must still work.
  const legacy = await api(token, 'POST', '/api/purchases', {
    vendor_name: 'Vendor E',
    item_name: 'Wheat',
    quantity: 4,
    unit_type: 'kg',
    amount: 200,
    selling_price: 60,
    payment_mode: 'cash',
  });
  check('amount-only request still accepted', legacy.status === 201, JSON.stringify(legacy.body));
  check('rate back-derived as 200/4 = 50', legacy.body.rate === 50, `got ${legacy.body.rate}`);

  console.log('\nEditing recomputes the total');
  console.log('----------------------------');

  const edited = await api(token, 'PUT', `/api/purchases/${simple.body._id}`, {
    vendor_name: 'Vendor A',
    item_name: 'Onion',
    quantity: 10,
    unit_type: 'kg',
    rate: 45,
    payment_mode: 'cash',
  });
  check('edit accepted', edited.status === 200, JSON.stringify(edited.body));
  check('total = 10 x 45 = 450', edited.body.amount === 450, `got ${edited.body.amount}`);

  const onionAfter = await Item.findByName(shop._id, 'Onion');
  check('stock adjusted to 10 kg', onionAfter.stock_quantity === 10, `got ${onionAfter.stock_quantity}`);
  check('cost per kg now 45', onionAfter.last_cost_price === 45, `got ${onionAfter.last_cost_price}`);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('='.repeat(46));

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
