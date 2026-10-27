'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

// Account-lockout constants
const MAX_FAILED = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      default: 'patient',
    },
    // Doctor-specific fields
    specialization: {
      type: String,
      trim: true,
      maxlength: [100, 'Specialization must be at most 100 characters'],
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone must be at most 20 characters'],
      default: '',
    },
    failedLoginCount: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Virtuals and methods
// ---------------------------------------------------------------------------

/** Returns true if account is currently locked */
userSchema.virtual('isLocked').get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

/**
 * Compare a plain-text password to the stored hash.
 * Also handles lockout counting.
 * Returns { ok: boolean, locked: boolean }
 */
userSchema.methods.verifyPassword = async function (plainText) {
  // Compare even if locked, to avoid timing leaks (the lockout check is done before calling this)
  const match = await bcrypt.compare(plainText, this.passwordHash);

  if (!match) {
    this.failedLoginCount += 1;
    if (this.failedLoginCount >= MAX_FAILED) {
      this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await this.save();
    return false;
  }

  // Reset on success
  if (this.failedLoginCount > 0 || this.lockUntil) {
    this.failedLoginCount = 0;
    this.lockUntil = null;
    await this.save();
  }
  return true;
};

/** Hash a plain password (used in seed script and signup) */
userSchema.statics.hashPassword = (plain) =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

const User = mongoose.model('User', userSchema);
module.exports = User;
