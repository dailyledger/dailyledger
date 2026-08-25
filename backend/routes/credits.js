const express = require('express');
const router = express.Router();
const Credit = require('../models/Credit');
const Item = require('../models/Item');
const buildDateFilter = require('../utils/dateFilter');

async function validateItemsAgainstCatalog(items) {
  for (const lineItem of items) {
    const catalogItem = await Item.findOne({ item_name: lineItem.item_name });

    if (!catalogItem) {
      return `Item "${lineItem.item_name}" must be purchased/added first before it can be given on credit`;
    }

    if (catalogItem.unit_type !== lineItem.unit_type) {
      return `Unit type mismatch for "${lineItem.item_name}": catalog uses "${catalogItem.unit_type}", credit uses "${lineItem.unit_type}"`;
    }
  }

  return null;
}

// Only run at creation time: at this point stock hasn't been decremented yet.
// Running this same check on edit would compare against stock that was already
// reduced by this credit's own original quantities, producing false rejections.
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
    const credits = await Credit.find(buildDateFilter(req)).sort({ date: -1 });
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

router.put('/:id', async (req, res) => {
  try {
    const { customer_name, phone, items, total_amount, notes } = req.body;

    const validationError = await validateItemsAgainstCatalog(items || []);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const credit = await Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({ error: 'Credit entry not found' });
    }

    credit.customer_name = customer_name;
    credit.phone = phone;
    credit.items = items;
    credit.total_amount = total_amount;
    credit.notes = notes;

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
