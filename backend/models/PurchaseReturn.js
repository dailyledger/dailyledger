const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
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
});

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
