'use strict';
const Joi = require('joi');

// ── Common helpers ──────────────────────────────────────────────────────────

const email = Joi.string().email({ tlds: { allow: false } }).lowercase().trim().max(254);
const password = Joi.string().min(8).max(128);
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

// ── Auth ────────────────────────────────────────────────────────────────────

const signup = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  email: email.required(),
  password: password.required(),
  confirmPassword: Joi.any()
    .valid(Joi.ref('password'))
    .required()
    .messages({ 'any.only': 'Passwords do not match' }),
});

const login = Joi.object({
  email: email.required(),
  password: Joi.string().max(128).required(),
});

// ── Appointments ─────────────────────────────────────────────────────────────

const createAppointment = Joi.object({
  title: Joi.string().trim().min(3).max(100).required(),
  startsAt: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Appointment must be in the future',
  }),
  durationMinutes: Joi.number().integer().min(15).max(240).default(30),
  notes: Joi.string().trim().max(500).allow('').default(''),
  doctor: objectId.allow('', null).optional(),
});

const rescheduleAppointment = Joi.object({
  startsAt: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Appointment must be in the future',
  }),
  durationMinutes: Joi.number().integer().min(15).max(240),
  notes: Joi.string().trim().max(500).allow(''),
});

const updateStatus = Joi.object({
  status: Joi.string().valid('approved', 'rejected', 'completed').required(),
  note: Joi.string().trim().max(200).allow('').default(''),
});

const listAppointments = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected', 'completed', 'cancelled'),
  from: Joi.date().iso(),
  to: Joi.date().iso().min(Joi.ref('from')),
  search: Joi.string().trim().max(100).allow(''),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

const availability = Joi.object({
  date: Joi.date().iso().required(),
  doctor: objectId.allow('', null).optional(),
});

module.exports = {
  signup,
  login,
  createAppointment,
  rescheduleAppointment,
  updateStatus,
  listAppointments,
  availability,
  objectId,
};
