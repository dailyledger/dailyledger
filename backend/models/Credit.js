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
  notes: {
    type: String,
  },
});

module.exports = mongoose.model('Credit', creditSchema);
