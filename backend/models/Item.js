const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  item_name: {
    type: String,
    required: true,
    unique: true,
  },
  unit_type: {
    type: String,
    enum: ['kg', 'litre', 'piece'],
    required: true,
  },
  last_price: {
    type: Number,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Item', itemSchema);
