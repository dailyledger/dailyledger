const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  item_name: {
    type: String,
    required: true,
    trim: true,
  },
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  stock_quantity: {
    type: Number,
    default: 0,
  },
  last_cost_price: {
    type: Number,
    default: 0,
  },
  last_selling_price: {
    type: Number,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// Blocker 01: uniqueness is per shop, not global. Previously two shops could not
// both stock an item called "Sugar".
itemSchema.index({ shop: 1, item_name: 1 }, { unique: true });

// Staff find items by typing the name, so lookups are case-insensitive and a
// near-duplicate ("banana" vs "Banana") must resolve to the existing item rather
// than silently creating a second one with its own stock.
itemSchema.statics.findByName = function findByName(shop, itemName, session) {
  const escaped = String(itemName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return this.findOne(
    { shop, item_name: { $regex: `^${escaped}$`, $options: 'i' } },
    null,
    session ? { session } : undefined
  );
};

module.exports = mongoose.model('Item', itemSchema);
