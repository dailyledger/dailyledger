const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
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

router.post('/', async (req, res) => {
  try {
    const items = req.body.items || [];

    const validationError = await validateItemsAgainstCatalog(items);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    for (const lineItem of items) {
      await Item.updateOne(
        { item_name: lineItem.item_name },
        { last_price: lineItem.price_per_unit }
      );
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

module.exports = router;
