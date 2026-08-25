const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  vendor_name: {
    type: String,
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
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  amount: {
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
  notes: {
    type: String,
  },
});

module.exports = mongoose.model('Purchase', purchaseSchema);
