const { dateKeyFor } = require('./shopDay');
const { InsufficientStockError } = require('./stock');
const { BadRequestError } = require('./dateFilter');

/**
 * Per-request context every ledger write needs: which shop, which business day,
 * and who is acting.
 *
 * `date` may be supplied by the client for back-dated entries, but `date_key` is
 * always derived here from the shop's timezone — never taken from the client.
 */
// Back-dating is normal — the shop was busy and yesterday's book gets entered the
// next morning. Forward-dating never is: a mistyped year hides the entry in a
// month nobody will look at while still counting in the all-time totals.
const MAX_BACKDATE_DAYS = 365;

function writeContext(req, suppliedDate) {
  const date = suppliedDate ? new Date(suppliedDate) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError('Invalid date');
  }

  if (suppliedDate) {
    const now = Date.now();
    // A couple of minutes of slack, so a phone with a slightly fast clock is fine.
    if (date.getTime() > now + 2 * 60 * 1000) {
      throw new BadRequestError('Date cannot be in the future');
    }
    if (date.getTime() < now - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestError(`Date cannot be more than ${MAX_BACKDATE_DAYS} days ago`);
    }
  }

  return {
    shop: req.shopId,
    date,
    date_key: dateKeyFor(date, req.shop.timezone, req.shop.day_start_hour),
    username: req.user?.username || 'unknown',
  };
}

/**
 * Blocker 06c: a double-tap on a slow connection sends the same write twice.
 * The client stamps one key per submission; if we have already stored a record
 * under it, return that instead of creating a second one.
 */
async function findByIdempotencyKey(Model, shop, key) {
  if (!key || typeof key !== 'string') {
    return null;
  }
  return Model.findOne({ shop, idempotency_key: key });
}

function idempotencyKeyFrom(req) {
  const key = req.get('Idempotency-Key') || req.body?.idempotency_key;
  return typeof key === 'string' && key.trim() ? key.trim().slice(0, 100) : null;
}

/**
 * Translate an error into a response. Kept in one place so every route reports
 * the same way.
 *
 * InsufficientStockError becomes 409 rather than 400: the sale is not invalid,
 * it just needs the operator to confirm that stock will go negative (blocker 06b).
 */
function sendError(res, err, fallback = 'Server error') {
  if (err instanceof InsufficientStockError) {
    return res.status(409).json({
      error: 'stock_would_go_negative',
      message: describeShortfalls(err.shortfalls),
      shortfalls: err.shortfalls,
      confirmable: true,
    });
  }

  if (err instanceof BadRequestError) {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Duplicate key on the idempotency index: two identical submissions raced.
  if (err.code === 11000 && err.keyPattern?.idempotency_key) {
    return res.status(409).json({ error: 'This entry was already saved' });
  }

  console.error(err);
  return res.status(500).json({ error: fallback });
}

function describeShortfalls(shortfalls) {
  return shortfalls
    .map(
      (s) =>
        `${s.item_name}: recording ${s.requested} but only ${s.available} in stock ` +
        `(${s.short_by} short)`
    )
    .join('; ');
}

module.exports = {
  writeContext,
  findByIdempotencyKey,
  idempotencyKeyFrom,
  sendError,
  describeShortfalls,
  MAX_BACKDATE_DAYS,
};
