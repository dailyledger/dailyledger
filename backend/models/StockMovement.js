const mongoose = require('mongoose');

// Blocker 03 / 06a: stock used to be a single mutable number, so an edit that
// failed to adjust it left a drift nothing could explain or undo.
//
// Every change to Item.stock_quantity now also appends a movement here. The
// movement log is append-only: corrections and voids add a reversing row rather
// than rewriting history. Item.stock_quantity remains as a fast cache, updated
// in the same transaction, and can be rebuilt from these rows at any time
// (see scripts/verifyStock.js).
const stockMovementSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
  },
  item_name: {
    type: String,
    required: true,
  },
  // Signed: +12 for a purchase, -3 for a sale, +3 to reverse that sale.
  delta: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    enum: [
      'purchase',
      'sale',
      'credit',
      'spoilage',
      'sales_return',
      'purchase_return',
      'edit',
      'void',
      'adjustment',
    ],
    required: true,
  },
  // What caused it, so a movement can be traced back to its document.
  ref_model: {
    type: String,
    enum: ['Purchase', 'Sale', 'Credit', 'Spoilage', 'SalesReturn', 'PurchaseReturn', null],
    default: null,
  },
  ref_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  cost_per_unit: {
    type: Number,
    default: 0,
  },
  note: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  date_key: {
    type: String,
    required: true,
  },
});

stockMovementSchema.index({ shop: 1, item_name: 1, date: -1 });
stockMovementSchema.index({ shop: 1, ref_model: 1, ref_id: 1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
