const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const SalesReturn = require('../models/SalesReturn');
const buildDateFilter = require('../utils/dateFilter');

async function validateItemsAgainstCatalog(items) {
  for (const lineItem of items) {
    const catalogItem = await Item.findOne({ item_name: lineItem.item_name });

    if (!catalogItem) {
      return `Item "${lineItem.item_name}" must be purchased/added first before it can be sold`;
    }

    if (catalogItem.unit_type !== lineItem.unit_type) {
      return `Unit type mismatch for "${lineItem.item_name}": catalog uses "${catalogItem.unit_type}", sale uses "${lineItem.unit_type}"`;
    }
  }

  return null;
}

// Only run at creation time: at this point stock hasn't been decremented yet.
// Running this same check on edit would compare against stock that was already
// reduced by this sale's own original quantities, producing false rejections.
async function checkStockAvailability(items) {
  for (const lineItem of items) {
    const catalogItem = await Item.findOne({ item_name: lineItem.item_name });

    if (lineItem.quantity > catalogItem.stock_quantity) {
      return `Insufficient stock for "${lineItem.item_name}": requested ${lineItem.quantity}, available ${catalogItem.stock_quantity}`;
    }
  }

  return null;
}

router.post('/', async (req, res) => {
  try {
    const items = req.body.items || [];

    const validationError = await validateItemsAgainstCatalog(items);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const stockError = await checkStockAvailability(items);
    if (stockError) {
      return res.status(400).json({ error: stockError });
    }

    for (const lineItem of items) {
      const update = { $inc: { stock_quantity: -lineItem.quantity } };
      if (!lineItem.bargained) {
        update.$set = { last_selling_price: lineItem.price_per_unit };
      }
      await Item.updateOne({ item_name: lineItem.item_name }, update);
    }

    const sale = new Sale(req.body);
    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    console.error(err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const sales = await Sale.find(buildDateFilter(req)).sort({ date: -1 });
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid sale id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { items, total_amount, payment_mode, notes } = req.body;

    const validationError = await validateItemsAgainstCatalog(items || []);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    sale.items = items;
    sale.total_amount = total_amount;
    sale.payment_mode = payment_mode;
    sale.notes = notes;

    await sale.save();
    res.json(sale);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid sale id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/returns', async (req, res) => {
  try {
    const returns = await SalesReturn.find({ sale_id: req.params.id }).sort({ date: -1 });
    res.json(returns);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid sale id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/return', async (req, res) => {
  try {
    const { item_name, quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Return quantity must be greater than 0' });
    }

    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const lineItem = sale.items.find((item) => item.item_name === item_name);
    if (!lineItem) {
      return res.status(400).json({ error: `"${item_name}" was not part of this sale` });
    }

    const existingReturns = await SalesReturn.find({ sale_id: sale._id, item_name });
    const alreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
    const returnable = lineItem.quantity - alreadyReturned;

    if (quantity > returnable) {
      return res.status(400).json({
        error: `Cannot return ${quantity} of "${item_name}": only ${returnable} unit(s) remain returnable (${lineItem.quantity} sold, ${alreadyReturned} already returned).`,
      });
    }

    await Item.updateOne({ item_name }, { $inc: { stock_quantity: quantity } });

    const salesReturn = new SalesReturn({
      sale_id: sale._id,
      item_name,
      quantity,
      reason: reason || undefined,
      refund_amount: quantity * lineItem.price_per_unit,
    });
    await salesReturn.save();

    res.status(201).json(salesReturn);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid sale id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
