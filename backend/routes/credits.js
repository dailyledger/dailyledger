const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');

router.post('/', async (req, res) => {
  try {
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
    credit.status = credit.amount_paid >= credit.amount ? 'paid' : 'partially_paid';

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
