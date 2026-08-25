const express = require('express');
const router = express.Router();
const Spoilage = require('../models/Spoilage');

router.post('/', async (req, res) => {
  try {
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
    const spoilageEntries = await Spoilage.find().sort({ date: -1 });
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

module.exports = router;
