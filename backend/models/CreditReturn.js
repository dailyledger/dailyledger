const mongoose = require('mongoose');

// Goods a customer brings back from a credit sale. Mirrors SalesReturn: the goods go
// back into stock and the customer owes less. Anything already paid beyond the new
// total is refunded through a CreditPayment of kind "refund".
const creditReturnSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  credit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit', required: true, index: true },
  item_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  refund_amount: { type: Number, required: true },
  cost_per_unit: { type: Number, default: 0 },
  reason: { type: String },
  refund_payment_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  date: { type: Date, default: Date.now },
  date_key: { type: String, required: true },
  voided_at: { type: Date, default: null },
  voided_by: { type: String, default: null },
  idempotency_key: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

creditReturnSchema.index({ shop: 1, date_key: 1 });
creditReturnSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('CreditReturn', creditReturnSchema);
