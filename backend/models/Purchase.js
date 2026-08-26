const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  vendor_name: {
    type: String,
    required: true,
  },
  item_name: {
    type: String,
    required: true,
  },
  // Quantity is in packs when units_per_pack > 1, otherwise in stock units.
  quantity: {
    type: Number,
    required: true,
  },
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  units_per_pack: {
    type: Number,
    default: 1,
  },
  payment_mode: {
    type: String,
    enum: ['cash', 'gpay'],
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

purchaseSchema.index({ shop: 1, date: -1 });
purchaseSchema.index({ shop: 1, date_key: 1 });
purchaseSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('Purchase', purchaseSchema);
