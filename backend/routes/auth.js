const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');

/**
 * Failed logins all look the same to the caller (so the form never reveals which
 * accounts exist), which makes them hard to debug. The real reason goes to the
 * server log instead. Passwords are never logged.
 */
function denyLogin(res, reason, username, message = 'Invalid username or password') {
  console.warn(`[login] DENIED reason=${reason} username=${JSON.stringify(username)}`);
  return res.status(401).json({ error: message });
}

router.post('/login', async (req, res) => {
  try {
    const { username, password, portal } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return denyLogin(res, 'no_such_user', username);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return denyLogin(res, `wrong_password (account role=${user.role})`, username);
    }

    if (user.active === false) {
      return denyLogin(res, 'account_deactivated', username, 'This account has been deactivated');
    }

    // Two sites share this API: admins sign in on the admin site, everyone else on
    // the stall site. Each site refuses the other's accounts, with the same message
    // as a wrong password so the login form does not reveal which accounts exist.
    const isAdmin = user.role === 'admin';
    if (isAdmin !== (portal === 'admin')) {
      return denyLogin(
        res,
        `wrong_site (account role=${user.role}, site=${portal || 'stall'})`,
        username
      );
    }

    if (isAdmin) {
      const adminToken = jwt.sign(
        { sub: user._id.toString(), username: user.username, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );
      console.log(`[login] OK admin username=${JSON.stringify(username)}`);
      return res.json({ token: adminToken, user: { username: user.username, role: 'admin' } });
    }

    if (!user.shop) {
      return denyLogin(
        res,
        'no_shop_linked',
        username,
        'This account is not linked to a shop. Run scripts/migrate.js or contact the owner.'
      );
    }

    const shop = await Shop.findById(user.shop).lean();
    if (!shop) {
      return denyLogin(res, 'shop_missing', username, 'The shop for this account no longer exists');
    }
    if (shop.active === false) {
      return denyLogin(res, 'stall_deactivated', username, 'This stall has been deactivated');
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

    console.log(`[login] OK stall username=${JSON.stringify(username)} shop=${JSON.stringify(shop.name)}`);
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
