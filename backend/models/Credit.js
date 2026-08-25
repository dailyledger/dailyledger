const mongoose = require('mongoose');

const creditSchema = new mongoose.Schema({
  customer_name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  amount: {
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
  notes: {
    type: String,
  },
});

module.exports = mongoose.model('Credit', creditSchema);
