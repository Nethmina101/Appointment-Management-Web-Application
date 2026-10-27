'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/appointmentController');
const adminCtrl = require('../controllers/adminController');
const { authenticate, requireAdmin, requirePatient, requireAdminOrDoctor, validate, validateObjectId } = require('../middleware');
const schemas = require('../validators/schemas');

// All appointment routes require login
router.use(authenticate);

// Doctors list — for patients to select when booking
router.get('/doctors', adminCtrl.listDoctors);

// Availability — must be before /:id routes to avoid id collision
router.get('/availability', validate(schemas.availability, 'query'), ctrl.availability);

// List (patients see their own, doctors see their assigned patients, admins see all)
router.get('/', validate(schemas.listAppointments, 'query'), ctrl.list);

// Create (patients only — doctors/admins don't book for themselves)
router.post('/', requirePatient, validate(schemas.createAppointment), ctrl.create);

// Reschedule (patient owner)
router.put('/:id', validateObjectId('id'), validate(schemas.rescheduleAppointment), ctrl.reschedule);

// Cancel (patient owner, assigned doctor, or admin)
router.patch('/:id/cancel', validateObjectId('id'), ctrl.cancel);

// Status update (admin or assigned doctor)
router.patch('/:id/status', validateObjectId('id'), requireAdminOrDoctor, validate(schemas.updateStatus), ctrl.updateStatus);

module.exports = router;
