'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/appointmentController');
const { authenticate, requireAdmin, validate, validateObjectId } = require('../middleware');
const schemas = require('../validators/schemas');

// All appointment routes require login
router.use(authenticate);

// Availability — must be before /:id routes to avoid id collision
router.get('/availability', validate(schemas.availability, 'query'), ctrl.availability);

// List
router.get('/', validate(schemas.listAppointments, 'query'), ctrl.list);

// Create (clients only — admins typically don't book)
router.post('/', validate(schemas.createAppointment), ctrl.create);

// Reschedule (owner)
router.put('/:id', validateObjectId('id'), validate(schemas.rescheduleAppointment), ctrl.reschedule);

// Cancel (owner or admin)
router.patch('/:id/cancel', validateObjectId('id'), ctrl.cancel);

// Admin status update
router.patch('/:id/status', validateObjectId('id'), requireAdmin, validate(schemas.updateStatus), ctrl.updateStatus);

module.exports = router;
