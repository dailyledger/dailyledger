const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const buildDateFilter = require('../utils/dateFilter');

router.post('/', async (req, res) => {
  try {
    const { item_name, unit_type, quantity, amount, selling_price } = req.body;

    if (!selling_price || selling_price <= 0) {
      return res.status(400).json({ error: 'Selling price is required and must be greater than 0' });
    }

    const costPerUnit = quantity ? amount / quantity : 0;

    const existingItem = await Item.findOne({ item_name });

    if (!existingItem) {
      await Item.create({
        item_name,
        unit_type,
        stock_quantity: quantity,
        last_cost_price: costPerUnit,
        last_selling_price: selling_price || 0,
      });
    } else {
      const setFields = { last_cost_price: costPerUnit };
      if (selling_price) {
        setFields.last_selling_price = selling_price;
      }

      await Item.updateOne(
        { item_name },
        {
          $inc: { stock_quantity: quantity },
          $set: setFields,
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

    const oldItemName = purchase.item_name;
    const oldQuantity = purchase.quantity;

    if (item_name === oldItemName) {
      // Stock isn't tracked per-purchase (no lot tracking), so we can't know
      // exactly how much of THIS purchase's stock was consumed. Instead, treat
      // the edit as applying the quantity delta to the pooled stock, and reject
      // if that would drive it negative — i.e. more has already been sold,
      // credited, or spoiled than the new (lower) quantity would allow for.
      const item = await Item.findOne({ item_name });
      if (!item) {
        return res.status(400).json({ error: `Item "${item_name}" not found in catalog` });
      }

      const delta = quantity - oldQuantity;
      const newStock = item.stock_quantity + delta;

      if (newStock < 0) {
        const minQuantity = Math.max(0, oldQuantity - item.stock_quantity);
        return res.status(400).json({
          error: `Cannot reduce quantity to ${quantity} for "${item_name}": ${oldQuantity - item.stock_quantity} unit(s) originally added by this purchase have already been sold, credited, or spoiled. Minimum allowed quantity is ${minQuantity}.`,
        });
      }

      await Item.updateOne({ item_name }, { $inc: { stock_quantity: delta } });
    } else {
      // Item was changed: give back the old item's contribution, then add to the new item.
      const oldItem = await Item.findOne({ item_name: oldItemName });
      if (oldItem) {
        if (oldItem.stock_quantity - oldQuantity < 0) {
          return res.status(400).json({
            error: `Cannot move this purchase away from "${oldItemName}": removing its ${oldQuantity} unit(s) would drive "${oldItemName}" stock negative (some have already been sold, credited, or spoiled).`,
          });
        }
        await Item.updateOne({ item_name: oldItemName }, { $inc: { stock_quantity: -oldQuantity } });
      }

      const newItem = await Item.findOne({ item_name });
      if (!newItem) {
        return res.status(400).json({ error: `Item "${item_name}" not found in catalog` });
      }
      await Item.updateOne({ item_name }, { $inc: { stock_quantity: quantity } });
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
