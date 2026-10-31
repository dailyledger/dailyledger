const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const StockMovement = require('../models/StockMovement');
const { round2, round3 } = require('../utils/money');
const { sendError } = require('../utils/ledger');
const { changeItemKind } = require('../utils/itemKind');

// Items are only ever created as a side effect of a Purchase (see routes/purchases.js).
// There is deliberately no POST / here — creating an item directly would let it be
// sold/credited/spoiled with stock that was never actually purchased.

router.get('/', async (req, res) => {
  try {
    // Blocker 01: only this shop's catalog.
    const items = await Item.find({ shop: req.shopId }).sort({ item_name: 1 });

    res.json(
      items.map((item) => ({
        ...item.toObject(),
        // What the stock on hand is worth, from the running average-cost value.
        stock_value: round2(
          item.inventory_value ?? Math.max(item.stock_quantity, 0) * item.last_cost_price
        ),
        // Negative stock means an entry is missing rather than that we owe
        // anyone goods — surface it so the owner can find the gap.
        needs_review: item.stock_quantity < 0,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, shop: req.shopId });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    sendError(res, err);
  }
});

// Correct an item's type (resale <-> raw material) while that is still safe.
router.patch('/:id/kind', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, shop: req.shopId });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    await changeItemKind(req.shopId, item, req.body?.kind);
    res.json({ id: item._id, kind: req.body.kind });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Every change to this item's stock, newest first — the answer to "why does this
 * say 7?". Made possible by the movement log added for blocker 03.
 */
router.get('/:id/movements', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, shop: req.shopId });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const movements = await StockMovement.find({
      shop: req.shopId,
      item_name: item.item_name,
    })
      .sort({ date: -1, _id: -1 })
      .limit(limit);

    const ledgerTotal = await StockMovement.aggregate([
      { $match: { shop: req.shopId, item_name: item.item_name } },
      { $group: { _id: null, total: { $sum: '$delta' } } },
    ]);

    const computed = ledgerTotal.length ? round3(ledgerTotal[0].total) : 0;

    res.json({
      item_name: item.item_name,
      stock_quantity: item.stock_quantity,
      computed_from_movements: computed,
      // If these disagree, the cache drifted and scripts/verifyStock.js can fix it.
      in_sync: round3(item.stock_quantity) === computed,
      movements,
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
