'use strict';
const User = require('../models/User');
const { signToken, cookieOptions, COOKIE_NAME } = require('../middleware');

// ── POST /api/auth/signup ──────────────────────────────────────────────────
exports.signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash, role: 'patient' });

    const token = signToken({ id: user._id, role: user.role });
    res.cookie(COOKIE_NAME, token, cookieOptions());

    return res.status(201).json({
      message: 'Account created',
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ───────────────────────────────────────────────────
const GENERIC_LOGIN_ERR = 'Incorrect email or password';

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Always fetch with passwordHash (select: false by default)
    const user = await User.findOne({ email }).select('+passwordHash +failedLoginCount +lockUntil');

    // Constant-time dummy compare when user not found
    if (!user) {
      await require('bcrypt').compare(password, '$2b$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
      return res.status(401).json({ message: GENERIC_LOGIN_ERR });
    }

    // Lockout check
    if (user.isLocked) {
      return res.status(401).json({ message: 'Account temporarily locked. Try again in 15 minutes.' });
    }

    const ok = await user.verifyPassword(password);
    if (!ok) {
      return res.status(401).json({ message: GENERIC_LOGIN_ERR });
    }

    const token = signToken({ id: user._id, role: user.role });
    res.cookie(COOKIE_NAME, token, cookieOptions());

    return res.json({
      message: 'Logged in',
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/logout ──────────────────────────────────────────────────
exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.cookie(COOKIE_NAME, '', {
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.json({ message: 'Logged out successfully' });
};

// ── GET /api/auth/me ───────────────────────────────────────────────────────
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('name email role specialization phone createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    next(err);
  }
};
