const mongoose = require('mongoose');

// Blocker 06d: a sale used to decrement stock item-by-item and only then save the
// sale document. A failure partway through left stock deducted for a sale that
// was never recorded — and Render's free tier sleeps and cold-starts, so
// mid-request failures are routine rather than rare.
//
// Atlas M0 is a real 3-node replica set, so transactions are available on the
// free tier. A standalone mongod (someone running MongoDB locally) is not, so we
// detect support once at startup and degrade to non-transactional writes there
// rather than failing every request.

let transactionsSupported = null;

async function detectTransactionSupport() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch (err) {
    transactionsSupported = false;
  }

  if (!transactionsSupported) {
    console.warn(
      '[tx] This MongoDB deployment is standalone, so multi-document transactions ' +
        'are unavailable. Writes will not be atomic. Use a replica set (Atlas does ' +
        'this by default) in production.'
    );
  }

  return transactionsSupported;
}

function isSupported() {
  return transactionsSupported === true;
}

/**
 * Run `fn(session)` inside a transaction when the deployment supports one.
 * `session` is null when it does not, and every caller passes it straight
 * through to Mongoose, which ignores a null session.
 */
async function runInTransaction(fn) {
  if (!isSupported()) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { detectTransactionSupport, isSupported, runInTransaction };
