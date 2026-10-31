const mongoose = require('mongoose');

// One row per payment (or refund) on a credit, so money collected has a date and a
// mode (cash or GPay) and shows up in the day's takings. Refunds are negative.
const creditPaymentSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  credit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit', required: true, index: true },
  amount: { type: Number, required: true },
  kind: { type: String, enum: ['payment', 'refund'], default: 'payment' },
  payment_mode: { type: String, enum: ['cash', 'gpay'], default: 'cash' },
  date: { type: Date, default: Date.now },
  date_key: { type: String, required: true },
  note: { type: String },
  voided_at: { type: Date, default: null },
  voided_by: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

creditPaymentSchema.index({ shop: 1, date_key: 1 });

module.exports = mongoose.model('CreditPayment', creditPaymentSchema);
