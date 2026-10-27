'use strict';
const mongoose = require('mongoose');
const User = require('../models/User');
const Appointment = require('../models/Appointment');

// ── GET /api/admin/analytics ────────────────────────────────────────────────
exports.analytics = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Run all queries in parallel for performance
    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayBookings,
      statusCounts,
      todayDoctorIds,
      recentAppointments,
      monthlyStats,
    ] = await Promise.all([
      // Total patients
      User.countDocuments({ role: 'patient' }),
      // Total doctors
      User.countDocuments({ role: 'doctor' }),
      // Total appointments
      Appointment.countDocuments({}),
      // Today's bookings
      Appointment.countDocuments({
        startsAt: { $gte: todayStart, $lte: todayEnd },
      }),
      // Status breakdown
      Appointment.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Today's unique doctors who have appointments
      Appointment.distinct('doctor', {
        startsAt: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['pending', 'approved'] },
        doctor: { $ne: null },
      }),
      // Recent 5 appointments
      Appointment.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email')
        .populate('doctor', 'name specialization')
        .lean(),
      // Monthly registration stats (last 6 months)
      User.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    // Flatten status counts
    const statusMap = {};
    statusCounts.forEach((s) => { statusMap[s._id] = s.count; });

    // Upcoming appointments count
    const upcomingCount = await Appointment.countDocuments({
      startsAt: { $gt: now },
      status: { $in: ['pending', 'approved'] },
    });

    // Completed today
    const completedToday = await Appointment.countDocuments({
      status: 'completed',
      updatedAt: { $gte: todayStart, $lte: todayEnd },
    });

    return res.json({
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayBookings,
      todayDoctorCount: todayDoctorIds.length,
      upcomingCount,
      completedToday,
      statusBreakdown: {
        pending: statusMap.pending || 0,
        approved: statusMap.approved || 0,
        rejected: statusMap.rejected || 0,
        completed: statusMap.completed || 0,
        cancelled: statusMap.cancelled || 0,
      },
      recentAppointments,
      monthlyStats,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/users ────────────────────────────────────────────────────
exports.listUsers = async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('name email role specialization phone createdAt')
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      users,
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

// ── GET /api/admin/users/:id ────────────────────────────────────────────────
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('name email role specialization phone createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/admin/users (create doctor) ───────────────────────────────────
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, specialization, phone } = req.body;

    const passwordHash = await User.hashPassword(password);
    const userData = { name, email, passwordHash, role: role || 'doctor' };
    if (specialization) userData.specialization = specialization;
    if (phone) userData.phone = phone;

    const user = await User.create(userData);

    return res.status(201).json({
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} account created`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, specialization: user.specialization, phone: user.phone },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/admin/users/:id ────────────────────────────────────────────────
exports.updateUser = async (req, res, next) => {
  try {
    const { name, email, role, specialization, phone, password } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Don't let admin demote themselves
    if (user._id.toString() === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (specialization !== undefined) user.specialization = specialization;
    if (phone !== undefined) user.phone = phone;
    if (password) user.passwordHash = await User.hashPassword(password);

    await user.save();

    return res.json({
      message: 'User updated',
      user: { id: user._id, name: user.name, email: user.email, role: user.role, specialization: user.specialization, phone: user.phone },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/admin/users/:id ─────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Don't let admin delete themselves
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete associated appointments
    await Appointment.deleteMany({ $or: [{ user: user._id }, { doctor: user._id }] });
    await user.deleteOne();

    return res.json({ message: `${user.role} account deleted` });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/admin/doctors (public list for booking) ────────────────────────
exports.listDoctors = async (req, res, next) => {
  try {
    const doctors = await User.find({ role: 'doctor' })
      .select('name email specialization phone')
      .sort({ name: 1 })
      .lean();

    return res.json({ doctors });
  } catch (err) {
    next(err);
  }
};
