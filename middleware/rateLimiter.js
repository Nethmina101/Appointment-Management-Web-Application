'use strict';
const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 3000 : (Number(process.env.RATE_LIMIT_MAX) || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 150 : (Number(process.env.AUTH_RATE_LIMIT_MAX) || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
  skipSuccessfulRequests: true, // successful logins/signups do not exhaust quota
});

module.exports = { generalLimiter, authLimiter };
