require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function main() {
  const { SEED_USERNAME, SEED_PASSWORD, MONGODB_URI } = process.env;

  if (!SEED_USERNAME || !SEED_PASSWORD) {
    console.error('Set SEED_USERNAME and SEED_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  const password_hash = await bcrypt.hash(SEED_PASSWORD, 10);

  await User.findOneAndUpdate(
    { username: SEED_USERNAME },
    { username: SEED_USERNAME, password_hash },
    { upsert: true, new: true }
  );

  console.log(`User "${SEED_USERNAME}" created/updated successfully.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
