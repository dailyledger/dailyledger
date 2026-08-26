const { isDateKey } = require('./shopDay');

// Blocker 05: filtering used to build `new Date('YYYY-MM-DDT00:00:00.000')`,
// which V8 parses in the *server's* zone — UTC on Render, while the shops are
// IST. Every boundary was 5.5 hours out.
//
// Records now carry `date_key`, already computed in the shop's zone, so a range
// filter is a lexicographic string comparison on "YYYY-MM-DD". No timezone math
// happens at query time, so there is nothing left to get wrong.

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Build the base query for any ledger collection.
 *
 * Always scoped to the caller's shop (blocker 01) and, unless asked otherwise,
 * excludes voided records (blocker 06a).
 */
function buildQuery(req, options = {}) {
  const { includeVoided = false, extra = {} } = options;

  if (!req.shopId) {
    throw new Error('buildQuery: req.shopId is missing — is requireAuth mounted?');
  }

  const query = { shop: req.shopId, ...extra };

  const { from, to } = req.query || {};

  if (from && !isDateKey(from)) {
    throw new BadRequestError('"from" must be a date in YYYY-MM-DD format');
  }
  if (to && !isDateKey(to)) {
    throw new BadRequestError('"to" must be a date in YYYY-MM-DD format');
  }
  if (from && to && from > to) {
    throw new BadRequestError('"from" date must not be after "to" date');
  }

  if (from || to) {
    query.date_key = {};
    if (from) query.date_key.$gte = from;
    if (to) query.date_key.$lte = to;
  }

  if (!includeVoided) {
    query.voided_at = null;
  }

  return query;
}

module.exports = buildQuery;
module.exports.buildQuery = buildQuery;
module.exports.BadRequestError = BadRequestError;
