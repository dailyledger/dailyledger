require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const itemsRouter = require('./routes/items');
const salesRouter = require('./routes/sales');
const purchasesRouter = require('./routes/purchases');
const creditsRouter = require('./routes/credits');
const spoilageRouter = require('./routes/spoilage');
const dashboardRouter = require('./routes/dashboard');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'DailyLedger API running' });
});

app.use('/api/items', itemsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/spoilage', spoilageRouter);
app.use('/api/dashboard', dashboardRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`DailyLedger API listening on port ${PORT}`);
});
