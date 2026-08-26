const mongoose = require('mongoose');
const { detectTransactionSupport } = require('./utils/tx');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MongoDB connection failed: MONGODB_URI is not set in .env');
    // The old code returned here and let the server start anyway, so the API
    // came up and answered every request with an opaque 500. Fail loudly instead.
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  await detectTransactionSupport();

  // Build the indexes declared on the schemas — including the compound uniqueness
  // that makes per-shop item catalogs possible.
  try {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.createIndexes())
    );
    console.log('Indexes ensured');
  } catch (err) {
    console.error('Index creation failed:', err.message);
  }
}

module.exports = connectDB;
