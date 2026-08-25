const express = require('express');
const router = express.Router();
const Spoilage = require('../models/Spoilage');
const Item = require('../models/Item');
const buildDateFilter = require('../utils/dateFilter');

router.post('/', async (req, res) => {
  try {
    const { item_name, quantity, unit_type } = req.body;

    const catalogItem = await Item.findOne({ item_name });

    if (!catalogItem) {
      return res.status(400).json({
        error: `Item "${item_name}" must be purchased/added first before it can be marked as spoilage`,
      });
    }

    if (catalogItem.unit_type !== unit_type) {
      return res.status(400).json({
        error: `Unit type mismatch for "${item_name}": catalog uses "${catalogItem.unit_type}", entry uses "${unit_type}"`,
      });
    }

    if (quantity > catalogItem.stock_quantity) {
      return res.status(400).json({
        error: `Insufficient stock for "${item_name}": requested ${quantity}, available ${catalogItem.stock_quantity}`,
      });
    }

    await Item.updateOne({ item_name }, { $inc: { stock_quantity: -quantity } });

    const spoilage = new Spoilage(req.body);
    await spoilage.save();
    res.status(201).json(spoilage);
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
    const spoilageEntries = await Spoilage.find(buildDateFilter(req)).sort({ date: -1 });
    res.json(spoilageEntries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const spoilage = await Spoilage.findById(req.params.id);
    if (!spoilage) {
      return res.status(404).json({ error: 'Spoilage entry not found' });
    }
    res.json(spoilage);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid spoilage id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { item_name, quantity, unit_type, estimated_value, reason, notes } = req.body;

    const catalogItem = await Item.findOne({ item_name });

    if (!catalogItem) {
      return res.status(400).json({
        error: `Item "${item_name}" must be purchased/added first before it can be marked as spoilage`,
      });
    }

    if (catalogItem.unit_type !== unit_type) {
      return res.status(400).json({
        error: `Unit type mismatch for "${item_name}": catalog uses "${catalogItem.unit_type}", entry uses "${unit_type}"`,
      });
    }

    const spoilage = await Spoilage.findById(req.params.id);
    if (!spoilage) {
      return res.status(404).json({ error: 'Spoilage entry not found' });
    }

    spoilage.item_name = item_name;
    spoilage.quantity = quantity;
    spoilage.unit_type = unit_type;
    spoilage.estimated_value = estimated_value;
    spoilage.reason = reason;
    spoilage.notes = notes;

    await spoilage.save();
    res.json(spoilage);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid spoilage id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
