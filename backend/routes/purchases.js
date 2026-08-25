const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const buildDateFilter = require('../utils/dateFilter');

router.post('/', async (req, res) => {
  try {
    const { item_name, unit_type, quantity, amount } = req.body;
    const costPerUnit = quantity ? amount / quantity : 0;

    const existingItem = await Item.findOne({ item_name });

    if (!existingItem) {
      await Item.create({
        item_name,
        unit_type,
        stock_quantity: quantity,
        last_cost_price: costPerUnit,
      });
    } else {
      await Item.updateOne(
        { item_name },
        {
          $inc: { stock_quantity: quantity },
          $set: { last_cost_price: costPerUnit },
        }
      );
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

router.put('/:id', async (req, res) => {
  try {
    const { vendor_name, item_name, quantity, unit_type, amount, payment_mode, notes } = req.body;

    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    purchase.vendor_name = vendor_name;
    purchase.item_name = item_name;
    purchase.quantity = quantity;
    purchase.unit_type = unit_type;
    purchase.amount = amount;
    purchase.payment_mode = payment_mode;
    purchase.notes = notes;

    await purchase.save();
    res.json(purchase);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid purchase id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
