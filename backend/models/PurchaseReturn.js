const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  purchase_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
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

purchaseReturnSchema.index({ shop: 1, purchase_id: 1 });
purchaseReturnSchema.index({ shop: 1, date_key: 1 });
purchaseReturnSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
