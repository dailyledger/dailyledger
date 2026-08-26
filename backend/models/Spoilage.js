const mongoose = require('mongoose');

const spoilageSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  item_name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  // Blocker 02/04: derived server-side from the item's cost price rather than
  // taken from the client, so spoilage is valued at what it actually cost us.
  estimated_value: {
    type: Number,
    required: true,
  },
  cost_per_unit: {
    type: Number,
    required: true,
    default: 0,
  },
  // "spoiled" was dropped as a third option because it overlapped with
  // "expired" — goods going bad over time is the same event either way. Existing
  // "spoiled" records were migrated to "expired" (see scripts/migrate.js).
  reason: {
    type: String,
    enum: ['expired', 'damaged'],
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  date_key: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
  },
  voided_at: {
    type: Date,
    default: null,
  },
  voided_by: {
    type: String,
    default: null,
  },
  void_reason: {
    type: String,
  },
  stock_warning: {
    type: String,
    default: null,
  },
  idempotency_key: {
    type: String,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

spoilageSchema.index({ shop: 1, date: -1 });
spoilageSchema.index({ shop: 1, date_key: 1 });
spoilageSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('Spoilage', spoilageSchema);
