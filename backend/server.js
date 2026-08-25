require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const requireAuth = require('./middleware/auth');
const authRouter = require('./routes/auth');
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

app.use('/api/auth', authRouter);

app.use('/api/items', requireAuth, itemsRouter);
app.use('/api/sales', requireAuth, salesRouter);
app.use('/api/purchases', requireAuth, purchasesRouter);
app.use('/api/credits', requireAuth, creditsRouter);
app.use('/api/spoilage', requireAuth, spoilageRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`DailyLedger API listening on port ${PORT}`);
});
