require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { DEFAULT_TIMEZONE } = require('../utils/shopDay');

async function main() {
  const {
    SEED_USERNAME,
    SEED_PASSWORD,
    SEED_ROLE,
    SHOP_NAME,
    SHOP_TIMEZONE,
    MONGODB_URI,
  } = process.env;

  if (!SEED_USERNAME || !SEED_PASSWORD) {
    console.error('Set SEED_USERNAME and SEED_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  // Every user belongs to a shop (blocker 01). Reuse the existing one so a second
  // seeded login joins the same shop rather than starting an empty one.
  let shop = await Shop.findOne().sort({ created_at: 1 });
  if (!shop) {
    shop = await Shop.create({
      name: SHOP_NAME || 'My Shop',
      timezone: SHOP_TIMEZONE || DEFAULT_TIMEZONE,
    });
    console.log(`Created shop "${shop.name}" (${shop._id})`);
  }

  const password_hash = await bcrypt.hash(SEED_PASSWORD, 10);

  await User.findOneAndUpdate(
    { username: SEED_USERNAME },
    {
      username: SEED_USERNAME,
      password_hash,
      shop: shop._id,
      role: SEED_ROLE === 'staff' ? 'staff' : 'owner',
    },
    { upsert: true, new: true }
  );

  console.log(`User "${SEED_USERNAME}" created/updated for shop "${shop.name}".`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
