const mongoose = require('mongoose');

const spoilageSchema = new mongoose.Schema({
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
  estimated_value: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    enum: ['spoiled', 'expired', 'damaged'],
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

module.exports = mongoose.model('Spoilage', spoilageSchema);
