'use strict';
const router = require('express').Router();
const adminCtrl = require('../controllers/adminController');
const { authenticate, requireAdmin, validateObjectId } = require('../middleware');

// All admin routes require login + admin role
router.use(authenticate, requireAdmin);

// Analytics dashboard data
router.get('/analytics', adminCtrl.analytics);

// User CRUD
router.get('/users', adminCtrl.listUsers);
router.get('/users/:id', validateObjectId('id'), adminCtrl.getUser);
router.post('/users', adminCtrl.createUser);
router.put('/users/:id', validateObjectId('id'), adminCtrl.updateUser);
router.delete('/users/:id', validateObjectId('id'), adminCtrl.deleteUser);

module.exports = router;
