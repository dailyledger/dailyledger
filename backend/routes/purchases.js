const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const buildDateFilter = require('../utils/dateFilter');

router.post('/', async (req, res) => {
  try {
    const { item_name, unit_type, quantity, amount } = req.body;

    const existingItem = await Item.findOne({ item_name });

    if (!existingItem) {
      const perUnitCost = quantity ? amount / quantity : 0;

      await Item.create({
        item_name,
        unit_type,
        last_price: perUnitCost || 0,
      });
    }

    const purchase = new Purchase(req.body);
    await purchase.save();
    res.status(201).json(purchase);
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
    const purchases = await Purchase.find(buildDateFilter(req)).sort({ date: -1 });
    res.json(purchases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    res.json(purchase);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid purchase id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
