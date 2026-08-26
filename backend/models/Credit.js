const mongoose = require('mongoose');

const creditItemSchema = new mongoose.Schema({
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
  // Blocker 02: cost snapshotted at the time the goods left the shop.
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

const creditSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  customer_name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  items: {
    type: [creditItemSchema],
    required: true,
  },
  total_amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid'],
    default: 'unpaid',
  },
  amount_paid: {
    type: Number,
    default: 0,
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

creditSchema.index({ shop: 1, date: -1 });
creditSchema.index({ shop: 1, date_key: 1 });
creditSchema.index({ shop: 1, status: 1 });
creditSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('Credit', creditSchema);
