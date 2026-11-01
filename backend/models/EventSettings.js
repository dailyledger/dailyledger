const mongoose = require('mongoose');

// One document describing the event the admin is running: its name (shown on the
// logins, the leaderboard and printed scorecards) and the date of Day 1, which lets
// the compare tool offer "Day 1 vs Day 2".
const eventSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'event', unique: true },
  name: { type: String, default: '' },
  tagline: { type: String, default: '' },
  day1: { type: String, default: '' },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('EventSettings', eventSettingsSchema);
