const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.shop) {
      return res.status(401).json({
        error: 'This account is not linked to a shop. Run scripts/migrate.js or contact the owner.',
      });
    }

    const shop = await Shop.findById(user.shop).lean();
    if (!shop) {
      return res.status(401).json({ error: 'The shop for this account no longer exists' });
    }

    // Blocker 01: the shop travels in the signed token, so it cannot be spoofed
    // by the client on subsequent requests.
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        username: user.username,
        shop: user.shop.toString(),
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { username: user.username, role: user.role },
      shop: {
        id: shop._id,
        name: shop.name,
        timezone: shop.timezone,
        day_start_hour: shop.day_start_hour,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
