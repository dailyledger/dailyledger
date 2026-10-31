const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const User = require('../models/User');

// Cheap in-process cache: the shop's timezone is needed on every write to stamp
// date_key, and it changes about never.
const shopCache = new Map();

async function loadShop(shopId) {
  const key = String(shopId);
  if (shopCache.has(key)) {
    return shopCache.get(key);
  }

  const shop = await Shop.findById(shopId).lean();
  if (shop) {
    shopCache.set(key, shop);
  }
  return shop;
}

function invalidateShopCache(shopId) {
  if (shopId) {
    shopCache.delete(String(shopId));
  } else {
    shopCache.clear();
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  // Admins oversee all stalls and have no shop of their own; stall data routes
  // are strictly per-shop, so an admin token must never reach them.
  if (payload.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot use stall data' });
  }

  // Blocker 01: the shop comes from the signed token only. Accepting it from the
  // body or a query parameter would let any logged-in user read another shop.
  if (!payload.shop || !mongoose.isValidObjectId(payload.shop)) {
    return res.status(401).json({ error: 'Token is not linked to a shop — please log in again' });
  }

  const shop = await loadShop(payload.shop);
  if (!shop) {
    return res.status(401).json({ error: 'Shop no longer exists' });
  }
  if (shop.active === false) {
    return res.status(401).json({ error: 'This stall has been deactivated' });
  }

  req.user = payload;
  req.shopId = new mongoose.Types.ObjectId(payload.shop);
  req.shop = shop;

  next();
}

/** Route guard for the admin console: a valid token whose account is an active admin. */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  if (payload.role !== 'admin' || !mongoose.isValidObjectId(payload.sub)) {
    return res.status(403).json({ error: 'Admin access only' });
  }

  // The role in the token is not enough: re-check the account so a removed or
  // deactivated admin loses access immediately.
  const user = await User.findById(payload.sub).select('role active').lean();
  if (!user || user.role !== 'admin' || user.active === false) {
    return res.status(401).json({ error: 'Admin account is no longer valid' });
  }

  req.user = payload;
  next();
}

/** Route guard for owner-only endpoints (voiding, cost/margin reports). */
function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the shop owner can do this' });
  }
  return next();
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireOwner = requireOwner;
module.exports.requireAdmin = requireAdmin;
module.exports.invalidateShopCache = invalidateShopCache;
