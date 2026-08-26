const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Spoilage = require('../models/Spoilage');
const Credit = require('../models/Credit');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');

function getPeriodStart(period) {
  const now = new Date();
  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function sumField(docs, field) {
  return docs.reduce((total, doc) => total + (doc[field] || 0), 0);
}

router.get('/summary', async (req, res) => {
  try {
    const period = req.query.period === 'week' ? 'week' : 'day';
    const start = getPeriodStart(period);
    const dateFilter = { date: { $gte: start } };

    const [sales, purchases, spoilageEntries, outstandingCredits, salesReturns, purchaseReturns] =
      await Promise.all([
        Sale.find(dateFilter),
        Purchase.find(dateFilter),
        Spoilage.find(dateFilter),
        Credit.find({ status: { $ne: 'paid' } }),
        SalesReturn.find(dateFilter),
        PurchaseReturn.find(dateFilter),
      ]);

    const total_sales = sumField(sales, 'total_amount') - sumField(salesReturns, 'refund_amount');
    const total_purchases = sumField(purchases, 'amount') - sumField(purchaseReturns, 'refund_amount');
    const total_spoilage = sumField(spoilageEntries, 'estimated_value');
    const profit = total_sales - total_purchases - total_spoilage;
    const total_outstanding_credit = outstandingCredits.reduce(
      (total, credit) => total + (credit.total_amount - credit.amount_paid),
      0
    );

    res.json({
      period,
      total_sales,
      total_purchases,
      total_spoilage,
      profit,
      total_outstanding_credit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
