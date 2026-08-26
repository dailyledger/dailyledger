const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Shop = require('../models/Shop');

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

  // Blocker 01: the shop comes from the signed token only. Accepting it from the
  // body or a query parameter would let any logged-in user read another shop.
  if (!payload.shop || !mongoose.isValidObjectId(payload.shop)) {
    return res.status(401).json({ error: 'Token is not linked to a shop — please log in again' });
  }

  const shop = await loadShop(payload.shop);
  if (!shop) {
    return res.status(401).json({ error: 'Shop no longer exists' });
  }

  req.user = payload;
  req.shopId = new mongoose.Types.ObjectId(payload.shop);
  req.shop = shop;

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
module.exports.invalidateShopCache = invalidateShopCache;
