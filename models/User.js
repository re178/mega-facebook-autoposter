const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({

  // 🔐 BASIC AUTH
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    required: true
  },

  // 👤 ROLES
  role: {
    type: String,
    enum: ['admin', 'moderator', 'user'],
    default: 'user'
  },

  // 📱 OPTIONAL (for M-PESA later)
  phone: {
    type: String,
    default: null
  },

  // 💳 SUBSCRIPTION SYSTEM (READY BUT SAFE)
  subscription: {
    status: {
      type: String,
      enum: ['free', 'active', 'expired'],
      default: 'free'
    },

    plan: {
      type: String,
      default: 'free'
    },

    startDate: Date,
    expiryDate: Date
  },

  // 📊 USAGE TRACKING (for limits later)
  usage: {
    postsToday: {
      type: Number,
      default: 0
    },
    lastPostDate: Date
  },

  // 🔐 ACCOUNT STATUS
  isActive: {
    type: Boolean,
    default: true
  },

  // 🔒 SECURITY (future-proof)
  lastLogin: Date,

  // 🕒 TIMESTAMP
  createdAt: {
    type: Date,
    default: Date.now
  }

});

// 🔍 INDEXES (SAFE)
UserSchema.index({ email: 1 });

module.exports = mongoose.model('User', UserSchema);
