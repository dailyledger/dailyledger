const mongoose = require('mongoose');

// A cooking batch: raw materials go in, a dish comes out. The ingredients and
// their costs are frozen here so the dish's cost can always be explained later,
// even after the raw materials' own prices change.
const ingredientSchema = new mongoose.Schema(
  {
    item_name: { type: String, required: true },
    unit_type: { type: String, enum: ['kg', 'litre', 'piece'], required: true },
    quantity: { type: Number, required: true },
    cost_per_unit: { type: Number, required: true, default: 0 },
    line_cost: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const productionSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  },
  dish_name: { type: String, required: true },
  unit_type: { type: String, enum: ['kg', 'litre', 'piece'], required: true },
  // How many plates / glasses / kg this batch made.
  quantity: { type: Number, required: true },
  ingredients: { type: [ingredientSchema], required: true },
  // Cost of only what was used, and that spread over what was made.
  total_cost: { type: Number, required: true },
  cost_per_unit: { type: Number, required: true },
  selling_price: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  date_key: { type: String, required: true },
  notes: { type: String },
  stock_warning: { type: String, default: null },
  voided_at: { type: Date, default: null },
  voided_by: { type: String, default: null },
  void_reason: { type: String },
  idempotency_key: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

productionSchema.index({ shop: 1, date: -1 });
productionSchema.index({ shop: 1, date_key: 1 });
productionSchema.index(
  { shop: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

module.exports = mongoose.model('Production', productionSchema);
