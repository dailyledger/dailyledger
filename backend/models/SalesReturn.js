const mongoose = require('mongoose');

const salesReturnSchema = new mongoose.Schema({
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
  reason: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
