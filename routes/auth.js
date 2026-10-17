'use strict';
const router = require('express').Router();
const authCtrl = require('../controllers/authController');
const { validate } = require('../middleware');
const schemas = require('../validators/schemas');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authLimiter, validate(schemas.signup), authCtrl.signup);
router.post('/login',  authLimiter, validate(schemas.login),  authCtrl.login);
router.post('/logout', authCtrl.logout);
router.get('/me', require('../middleware').authenticate, authCtrl.me);

module.exports = router;
