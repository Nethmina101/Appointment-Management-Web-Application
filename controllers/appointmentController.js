'use strict';
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');

// ── Business-rule config ────────────────────────────────────────────────────
const WORK_START_HOUR = 9;   // 09:00 UTC
const WORK_END_HOUR   = 18;  // 18:00 UTC (last slot starts at 17:30)
const SLOT_MINUTES    = 30;
const MAX_ACTIVE_PER_CLIENT = 5;
const PAGE_DEFAULT    = 10;

// ─────────────────────────────────────────────────────────────────────────────

function slotIsWithinHours(date) {
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  if (h < WORK_START_HOUR) return false;
  if (h > WORK_END_HOUR) return false;
  if (h === WORK_END_HOUR && m > 0) return false;
  if (m % SLOT_MINUTES !== 0) return false;
  return true;
}

function isWeekend(date) {
  const day = date.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

// ── POST /api/appointments ──────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { title, startsAt, durationMinutes, notes } = req.body;
    const userId = req.user.id;
    const startDate = new Date(startsAt);

    // Business-rule checks
    if (startDate <= Date.now()) {
      return res.status(400).json({ message: 'Appointment must be in the future' });
    }
    if (isWeekend(startDate)) {
      return res.status(400).json({ message: 'Appointments can only be booked on working days (Mon–Fri)' });
    }
    if (!slotIsWithinHours(startDate)) {
      return res.status(400).json({
        message: `Appointments must be between ${WORK_START_HOUR}:00 and ${WORK_END_HOUR}:00 UTC, on ${SLOT_MINUTES}-minute slots`,
      });
    }

    // Active appointment cap
    const activeCount = await Appointment.countDocuments({
      user: userId,
      status: { $in: ['pending', 'approved'] },
      startsAt: { $gt: new Date() },
    });
    if (activeCount >= MAX_ACTIVE_PER_CLIENT) {
      return res.status(400).json({
        message: `You may have at most ${MAX_ACTIVE_PER_CLIENT} upcoming active appointments`,
      });
    }

    const appointment = await Appointment.create({
      user: userId,
      title,
      startsAt: startDate,
      durationMinutes: durationMinutes || 30,
      notes: notes || '',
      statusHistory: [{ status: 'pending', changedBy: userId }],
    });

    return res.status(201).json({ message: 'Appointment booked', appointment });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/appointments ───────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const { status, from, to, search, page = 1, limit = PAGE_DEFAULT } = req.query;

    const filter = {};

    // Ownership
    if (!isAdmin) filter.user = new mongoose.Types.ObjectId(req.user.id);

    if (status) filter.status = status;
    if (from || to) {
      filter.startsAt = {};
      if (from) filter.startsAt.$gte = new Date(from);
      if (to)   filter.startsAt.$lte = new Date(to);
    }

    // Admin search by client name (requires populate — done below)
    // For search by title:
    if (search) {
      filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ startsAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email') // fetch only name + email
        .lean(), // lean for performance
      Appointment.countDocuments(filter),
    ]);

    return res.json({
      appointments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/appointments/:id  (reschedule) ─────────────────────────────────
exports.reschedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { startsAt, durationMinutes, notes } = req.body;

    // Ownership + IDOR protection
    const appt = await Appointment.findOne({ _id: id, user: userId });
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    if (!['pending', 'approved'].includes(appt.status)) {
      return res.status(400).json({ message: 'Only pending or approved appointments can be rescheduled' });
    }

    const newDate = new Date(startsAt);
    if (newDate <= Date.now()) {
      return res.status(400).json({ message: 'New time must be in the future' });
    }
    if (isWeekend(newDate)) {
      return res.status(400).json({ message: 'Appointments can only be booked on working days' });
    }
    if (!slotIsWithinHours(newDate)) {
      return res.status(400).json({ message: 'New time must be within working hours on a 30-minute slot' });
    }

    appt.startsAt = newDate;
    if (durationMinutes) appt.durationMinutes = durationMinutes;
    if (notes !== undefined) appt.notes = notes;
    appt.status = 'pending'; // reset to pending so admin re-approves
    appt.statusHistory.push({ status: 'pending', changedBy: userId, note: 'Rescheduled by client' });

    await appt.save();
    return res.json({ message: 'Appointment rescheduled', appointment: appt });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/appointments/:id/cancel ─────────────────────────────────────
exports.cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const filter = role === 'admin' ? { _id: id } : { _id: id, user: userId };
    const appt = await Appointment.findOne(filter);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    if (!['pending', 'approved'].includes(appt.status)) {
      return res.status(400).json({ message: 'Only pending or approved appointments can be cancelled' });
    }

    appt.status = 'cancelled';
    appt.statusHistory.push({
      status: 'cancelled',
      changedBy: userId,
      note: role === 'admin' ? 'Cancelled by admin' : 'Cancelled by client',
    });
    await appt.save();
    return res.json({ message: 'Appointment cancelled', appointment: appt });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/appointments/:id/status  (admin only) ───────────────────────
exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    if (!Appointment.isValidTransition(appt.status, status)) {
      return res.status(400).json({
        message: `Cannot transition from "${appt.status}" to "${status}"`,
      });
    }

    appt.status = status;
    appt.statusHistory.push({ status, changedBy: req.user.id, note: note || '' });
    await appt.save();
    return res.json({ message: `Appointment ${status}`, appointment: appt });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/appointments/availability ─────────────────────────────────────
exports.availability = async (req, res, next) => {
  try {
    const { date } = req.query;
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);

    if (isWeekend(dayStart)) {
      return res.json({ slots: [], message: 'No appointments on weekends' });
    }

    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Get all active bookings for that day
    const booked = await Appointment.find({
      startsAt: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['pending', 'approved'] },
    })
      .select('startsAt durationMinutes')
      .lean();

    const bookedTimes = new Set(booked.map((a) => a.startsAt.getTime()));

    // Generate all slots for the day
    const slots = [];
    const now = Date.now();
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTES) {
        const slot = new Date(dayStart);
        slot.setUTCHours(h, m, 0, 0);
        if (slot.getTime() > now && !bookedTimes.has(slot.getTime())) {
          slots.push(slot.toISOString());
        }
      }
    }

    return res.json({ slots });
  } catch (err) {
    next(err);
  }
};
