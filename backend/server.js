require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./db');
const requireAuth = require('./middleware/auth');
const authRouter = require('./routes/auth');
const itemsRouter = require('./routes/items');
const salesRouter = require('./routes/sales');
const purchasesRouter = require('./routes/purchases');
const creditsRouter = require('./routes/credits');
const spoilageRouter = require('./routes/spoilage');
const dashboardRouter = require('./routes/dashboard');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set in .env — refusing to start.');
  process.exit(1);
}

const app = express();

// Allow a comma-separated list so Vercel preview deployments keep working.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, health checks, same-origin requests.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed`));
    },
  })
);

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'DailyLedger API running' });
});

// Reports whether the database is actually reachable, rather than returning 200
// while every real request fails.
app.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    database: states[mongoose.connection.readyState] || 'unknown',
  });
});

app.use('/api/auth', authRouter);

app.use('/api/items', requireAuth, itemsRouter);
app.use('/api/sales', requireAuth, salesRouter);
app.use('/api/purchases', requireAuth, purchasesRouter);
app.use('/api/credits', requireAuth, creditsRouter);
app.use('/api/spoilage', requireAuth, spoilageRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`DailyLedger API listening on port ${PORT}`);
  });
});
