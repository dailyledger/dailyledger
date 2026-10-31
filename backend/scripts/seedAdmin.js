require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Creates (or resets the password of) the one admin login for the admin console.
// There is deliberately no public sign-up for admins: this script is the only way.
async function main() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, MONGODB_URI } = process.env;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD in .env before running this script.');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 4) {
    console.error('ADMIN_PASSWORD must be at least 4 characters.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const existing = await User.findOne({ username: ADMIN_USERNAME });
  if (existing && existing.role !== 'admin') {
    console.error(`"${ADMIN_USERNAME}" is already a stall login. Choose a different ADMIN_USERNAME.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await User.findOneAndUpdate(
    { username: ADMIN_USERNAME },
    {
      username: ADMIN_USERNAME,
      password_hash,
      role: 'admin',
      active: true,
      $unset: { shop: '' },
    },
    { upsert: true, new: true }
  );

  console.log(`Admin "${ADMIN_USERNAME}" created/updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
