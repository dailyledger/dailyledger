const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

// Items are only ever created as a side effect of a Purchase (see routes/purchases.js).
// There is deliberately no POST / here — creating an item directly would let it be
// sold/credited/spoiled with stock that was never actually purchased.

router.get('/', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid item id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
