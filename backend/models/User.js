const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password_hash: {
    type: String,
    required: true,
  },
  // Blocker 01: which shop this login belongs to. Every request is scoped to it,
  // and it is read from the signed token — never from the request body.
  // Admin accounts oversee every stall, so they belong to none.
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required() {
      return this.role !== 'admin';
    },
    index: true,
  },
  role: {
    type: String,
    enum: ['owner', 'staff', 'admin'],
    default: 'owner',
  },
  // Deactivating a stall blocks its logins without deleting any data.
  active: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
