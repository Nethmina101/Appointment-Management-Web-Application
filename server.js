'use strict';
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const morgan       = require('morgan');
const path         = require('path');

const connectDB            = require('./config/db');
const authRoutes           = require('./routes/auth');
const appointmentRoutes    = require('./routes/appointments');
const { errorHandler }     = require('./middleware');
const { generalLimiter }   = require('./middleware/rateLimiter');

const app = express();

// ─── Security middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5000',
  credentials: true,
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize()); // strips $-operator keys from req.body/query/params
app.use(generalLimiter);

// ─── Logging (skip in test env) ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── API routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);

// ─── SPA fallback — serve index.html for any unmatched non-API route ─────────
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Central error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
})();

module.exports = app;
