const mongoose = require('mongoose');
const { DEFAULT_TIMEZONE } = require('../utils/shopDay');

// Blocker 01: every record belongs to exactly one shop. Without this collection
// all shops shared one item catalog and could read each other's ledgers.
const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  timezone: {
    type: String,
    default: DEFAULT_TIMEZONE,
  },
  // Shops that trade past midnight count those sales as the previous day.
  // 0 means a plain midnight-to-midnight day.
  day_start_hour: {
    type: Number,
    default: 0,
    min: 0,
    max: 12,
  },
  // Who runs the stall; the admin console filters reports by this.
  owner_name: {
    type: String,
    trim: true,
    default: '',
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Shop', shopSchema);
