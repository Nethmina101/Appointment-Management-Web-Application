'use strict';
const mongoose = require('mongoose');

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

// Legal forward transitions
const TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
};

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: VALID_STATUSES },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title must be at most 100 characters'],
    },
    startsAt: {
      type: Date,
      required: [true, 'Start date/time is required'],
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: [15, 'Minimum duration is 15 minutes'],
      max: [240, 'Maximum duration is 240 minutes'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes must be at most 500 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: VALID_STATUSES,
      default: 'pending',
    },
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Indexes – as described in the guide §6
// ---------------------------------------------------------------------------
appointmentSchema.index({ startsAt: 1 });
appointmentSchema.index({ user: 1, startsAt: 1 });
appointmentSchema.index({ doctor: 1, startsAt: 1 });
appointmentSchema.index({ status: 1 });

// Partial unique index: prevent double-booking active slots per doctor
appointmentSchema.index(
  { doctor: 1, startsAt: 1 },
  {
    unique: true,
    partialFilterExpression: { 
      status: { $in: ['pending', 'approved'] },
      doctor: { $ne: null }
    },
    name: 'unique_doctor_active_slot',
  }
);

// ---------------------------------------------------------------------------
// Statics
// ---------------------------------------------------------------------------

/** Validate a status transition */
appointmentSchema.statics.isValidTransition = function (from, to) {
  return (TRANSITIONS[from] || []).includes(to);
};

appointmentSchema.statics.VALID_STATUSES = VALID_STATUSES;

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;
