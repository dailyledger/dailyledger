const mongoose = require('mongoose');

const salesReturnSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  sale_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: true,
  },
  item_name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  refund_amount: {
    type: Number,
    required: true,
  },
  // Cost of the returned goods, carried over from the sale line so a return
  // reverses the same margin the sale recorded.
  cost_per_unit: {
    type: Number,
    default: 0,
  },
  reason: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  date_key: {
    type: String,
    required: true,
  },
  voided_at: {
    type: Date,
    default: null,
  },
  voided_by: {
    type: String,
    default: null,
  },
  idempotency_key: {
    type: String,
    default: null,
  },
});

salesReturnSchema.index({ shop: 1, sale_id: 1 });
salesReturnSchema.index({ shop: 1, date_key: 1 });
salesReturnSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
