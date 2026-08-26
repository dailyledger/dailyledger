const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  item_name: {
    type: String,
    required: true,
  },
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price_per_unit: {
    type: Number,
    required: true,
  },
  // Blocker 02: the cost at the moment of sale, snapshotted from the catalog by
  // the server. Item.last_cost_price is overwritten by the next purchase, so
  // without this copy the margin on a past sale is unrecoverable.
  cost_per_unit: {
    type: Number,
    required: true,
    default: 0,
  },
  line_total: {
    type: Number,
    required: true,
  },
  bargained: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  items: {
    type: [saleItemSchema],
    required: true,
  },
  total_amount: {
    type: Number,
    required: true,
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
  // Blocker 05: the business day in the shop's timezone.
  date_key: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
  },
  // Blocker 06a: money records are voided, never deleted.
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
  // Blocker 06b: recorded when the sale was saved despite taking stock negative.
  stock_warning: {
    type: String,
    default: null,
  },
  // Blocker 06c: client-generated per submission, so a double-tap that sends the
  // same sale twice creates one record instead of two.
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

saleSchema.index({ shop: 1, date: -1 });
saleSchema.index({ shop: 1, date_key: 1 });
saleSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('Sale', saleSchema);
