const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const Item = require('../models/Item');
const PurchaseReturn = require('../models/PurchaseReturn');
const buildDateFilter = require('../utils/dateFilter');

function packSize(unitsPerPack) {
  return unitsPerPack && unitsPerPack > 1 ? unitsPerPack : 1;
}

router.post('/', async (req, res) => {
  try {
    const { item_name, unit_type, quantity, amount, selling_price, units_per_pack } = req.body;

    if (!selling_price || selling_price <= 0) {
      return res.status(400).json({ error: 'Selling price is required and must be greater than 0' });
    }

    const unitsPerPack = packSize(units_per_pack);
    const totalStockUnits = quantity * unitsPerPack;
    const costPerUnit = totalStockUnits ? amount / totalStockUnits : 0;

    const existingItem = await Item.findOne({ item_name });

    if (!existingItem) {
      await Item.create({
        item_name,
        unit_type,
        stock_quantity: totalStockUnits,
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
          $inc: { stock_quantity: totalStockUnits },
          $set: setFields,
        }
      );
    }

    const purchase = new Purchase({ ...req.body, units_per_pack: unitsPerPack });
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

    const returns = await PurchaseReturn.find({
      purchase_id: { $in: purchases.map((p) => p._id) },
    });
    const returnsByPurchase = {};
    for (const r of returns) {
      const key = r.purchase_id.toString();
      (returnsByPurchase[key] = returnsByPurchase[key] || []).push(r);
    }

    const enriched = purchases.map((purchase) => {
      const purchaseReturns = returnsByPurchase[purchase._id.toString()] || [];
      const returned_quantity = purchaseReturns.reduce((sum, r) => sum + r.quantity, 0);
      const returned_amount = purchaseReturns.reduce((sum, r) => sum + r.refund_amount, 0);
      return {
        ...purchase.toObject(),
        returned_quantity,
        returned_amount,
        net_quantity: purchase.quantity - returned_quantity,
        net_amount: purchase.amount - returned_amount,
      };
    });

    res.json(enriched);
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
    const { vendor_name, item_name, quantity, unit_type, amount, payment_mode, notes, units_per_pack } =
      req.body;

    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const oldItemName = purchase.item_name;
    const oldUnitsPerPack = packSize(purchase.units_per_pack);
    const oldTotalUnits = purchase.quantity * oldUnitsPerPack;

    const newUnitsPerPack = packSize(units_per_pack);
    const newTotalUnits = quantity * newUnitsPerPack;

    if (item_name === oldItemName) {
      // Stock isn't tracked per-purchase (no lot tracking), so we can't know
      // exactly how much of THIS purchase's stock was consumed. Instead, treat
      // the edit as applying the (pack-converted) quantity delta to the pooled
      // stock, and reject if that would drive it negative — i.e. more has
      // already been sold, credited, or spoiled than the edit would allow for.
      const item = await Item.findOne({ item_name });
      if (!item) {
        return res.status(400).json({ error: `Item "${item_name}" not found in catalog` });
      }

      const delta = newTotalUnits - oldTotalUnits;
      const newStock = item.stock_quantity + delta;

      if (newStock < 0) {
        const minStockUnits = Math.max(0, oldTotalUnits - item.stock_quantity);
        const minQuantity = Math.ceil(minStockUnits / newUnitsPerPack);
        return res.status(400).json({
          error: `Cannot reduce this purchase to ${quantity}: ${oldTotalUnits - item.stock_quantity} stock unit(s) originally added by this purchase have already been sold, credited, or spoiled. Minimum allowed quantity is ${minQuantity}.`,
        });
      }

      await Item.updateOne({ item_name }, { $inc: { stock_quantity: delta } });
    } else {
      // Item was changed: give back the old item's contribution, then add to the new item.
      const oldItem = await Item.findOne({ item_name: oldItemName });
      if (oldItem) {
        if (oldItem.stock_quantity - oldTotalUnits < 0) {
          return res.status(400).json({
            error: `Cannot move this purchase away from "${oldItemName}": removing its ${oldTotalUnits} stock unit(s) would drive "${oldItemName}" stock negative (some have already been sold, credited, or spoiled).`,
          });
        }
        await Item.updateOne({ item_name: oldItemName }, { $inc: { stock_quantity: -oldTotalUnits } });
      }

      const newItem = await Item.findOne({ item_name });
      if (!newItem) {
        return res.status(400).json({ error: `Item "${item_name}" not found in catalog` });
      }
      await Item.updateOne({ item_name }, { $inc: { stock_quantity: newTotalUnits } });
    }

    purchase.vendor_name = vendor_name;
    purchase.item_name = item_name;
    purchase.quantity = quantity;
    purchase.unit_type = unit_type;
    purchase.amount = amount;
    purchase.units_per_pack = newUnitsPerPack;
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

router.get('/:id/returns', async (req, res) => {
  try {
    const returns = await PurchaseReturn.find({ purchase_id: req.params.id }).sort({ date: -1 });
    res.json(returns);
  } catch (err) {
    console.error(err);
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid purchase id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/return', async (req, res) => {
  try {
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Return quantity must be greater than 0' });
    }

    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const existingReturns = await PurchaseReturn.find({ purchase_id: purchase._id });
    const alreadyReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
    const returnable = purchase.quantity - alreadyReturned;

    if (quantity > returnable) {
      return res.status(400).json({
        error: `Cannot return ${quantity} of "${purchase.item_name}": only ${returnable} unit(s) remain returnable (${purchase.quantity} purchased, ${alreadyReturned} already returned).`,
      });
    }

    const unitsPerPack = packSize(purchase.units_per_pack);
    const stockImpact = quantity * unitsPerPack;

    const item = await Item.findOne({ item_name: purchase.item_name });
    if (!item || stockImpact > item.stock_quantity) {
      return res.status(400).json({
        error: `Cannot return ${quantity} of "${purchase.item_name}": that represents ${stockImpact} stock unit(s), but only ${item ? item.stock_quantity : 0} are currently in stock (some may have already been sold, credited, or spoiled).`,
      });
    }

    await Item.updateOne({ item_name: purchase.item_name }, { $inc: { stock_quantity: -stockImpact } });

    const costPerUnit = purchase.quantity ? purchase.amount / purchase.quantity : 0;
    const purchaseReturn = new PurchaseReturn({
      purchase_id: purchase._id,
      item_name: purchase.item_name,
      quantity,
      reason: reason || undefined,
      refund_amount: quantity * costPerUnit,
    });
    await purchaseReturn.save();

    res.status(201).json(purchaseReturn);
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
