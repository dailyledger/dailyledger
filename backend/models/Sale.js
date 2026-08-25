const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
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

const saleSchema = new mongoose.Schema({
  items: {
    type: [saleItemSchema],
    required: true,
  },
  total_amount: {
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

module.exports = mongoose.model('Sale', saleSchema);
