const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const Item = require('../models/Item');

router.post('/', async (req, res) => {
  try {
    const items = req.body.items || [];

    for (const lineItem of items) {
      const catalogItem = await Item.findOne({ item_name: lineItem.item_name });

      if (!catalogItem) {
        return res.status(400).json({
          error: `Item "${lineItem.item_name}" must be purchased/added first before it can be given on credit`,
        });
      }

      if (catalogItem.unit_type !== lineItem.unit_type) {
        return res.status(400).json({
          error: `Unit type mismatch for "${lineItem.item_name}": catalog uses "${catalogItem.unit_type}", credit uses "${lineItem.unit_type}"`,
        });
      }
    }

    for (const lineItem of items) {
      await Item.updateOne(
        { item_name: lineItem.item_name },
        { last_price: lineItem.price_per_unit }
      );
    }

    const credit = new Credit(req.body);
    await credit.save();
    res.status(201).json(credit);
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
    const credits = await Credit.find().sort({ date: -1 });
    res.json(credits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const credit = await Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }
    res.json(credit);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid credit id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/pay', async (req, res) => {
  try {
    const { amount_paid } = req.body;

    if (typeof amount_paid !== 'number' || amount_paid <= 0) {
      return res.status(400).json({ error: 'amount_paid must be a positive number' });
    }

    const credit = await Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }

    credit.amount_paid += amount_paid;
    credit.status = credit.amount_paid >= credit.total_amount ? 'paid' : 'partially_paid';

    await credit.save();
    res.json(credit);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid credit id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
