'use strict';
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const schemas = require('../validators/schemas');

// ─── JWT cookie helpers ────────────────────────────────────────────────────

const COOKIE_NAME = 'token';

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: parseDuration(process.env.JWT_EXPIRES_IN || '2h'),
  };
}

function parseDuration(str) {
  const match = String(str).match(/^(\d+)(h|m|s|d)?$/);
  if (!match) return 2 * 60 * 60 * 1000;
  const [, num, unit] = match;
  const multipliers = { h: 3600000, m: 60000, s: 1000, d: 86400000 };
  return parseInt(num) * (multipliers[unit] || 3600000);
}

// ─── Authentication middleware ─────────────────────────────────────────────

function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Not logged in' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }
}

// ─── Role middleware ───────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

function requireClient(req, res, next) {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ message: 'Client access only' });
  }
  next();
}

// ─── Validation middleware factory ─────────────────────────────────────────

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });
    if (error) {
      const details = error.details.map((d) => d.message);
      return res.status(400).json({ message: 'Validation error', details });
    }
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    next();
  };
}

// ─── ObjectId param check ──────────────────────────────────────────────────

function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }
    next();
  };
}

// ─── Central error handler ─────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: 'Validation error', details });
  }

  // MongoDB duplicate key (unique constraint)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    if (field === 'startsAt') {
      return res.status(409).json({
        message: 'That slot was just taken; please choose another.',
      });
    }
    if (field === 'email') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    return res.status(409).json({ message: 'Duplicate entry' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Session invalid, please log in' });
  }

  if (isDev) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message, stack: err.stack });
  }

  return res.status(err.status || 500).json({ message: 'Internal server error' });
}

module.exports = {
  authenticate,
  requireAdmin,
  requireClient,
  validate,
  validateObjectId,
  errorHandler,
  signToken,
  cookieOptions,
  COOKIE_NAME,
};
