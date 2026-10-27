'use strict';
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function seed() {
  await connectDB();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file before seeding.');
    process.exit(1);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin account already exists for ${email}. No changes made.`);
  } else {
    const passwordHash = await User.hashPassword(password);
    await User.create({ name, email, passwordHash, role: 'admin' });
    console.log(`✅ Admin account created: ${email}`);
  }

  // Seed sample doctor if none exists
  const doctorCount = await User.countDocuments({ role: 'doctor' });
  if (doctorCount === 0) {
    const docHash = await User.hashPassword('DoctorPass@123');
    await User.create({
      name: 'Dr. Sarah Connor',
      email: 'dr.sarah@example.com',
      passwordHash: docHash,
      role: 'doctor',
      specialization: 'Cardiology',
      phone: '+1 555-0199',
    });
    console.log('✅ Sample doctor created: dr.sarah@example.com / DoctorPass@123');
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
