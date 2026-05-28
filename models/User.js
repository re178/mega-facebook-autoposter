const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({

  /* =====================================================
     BASIC AUTH
  ===================================================== */

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

  /* =====================================================
     EMAIL VERIFICATION
  ===================================================== */

  isVerified: {
    type: Boolean,
    default: false
  },

  verificationToken: {
    type: String,
    default: null
  },

  verificationExpires: {
    type: Date,
    default: null
  },

  /* =====================================================
     PASSWORD RESET
  ===================================================== */

  resetPasswordToken: {
    type: String,
    default: null
  },

  resetPasswordExpires: {
    type: Date,
    default: null
  },

  /* =====================================================
     USER ROLE
  ===================================================== */

  role: {
    type: String,
    enum: ['admin', 'moderator', 'user'],
    default: 'user'
  },

  /* =====================================================
     PHONE
  ===================================================== */

  phone: {
    type: String,
    default: null
  },

  /* =====================================================
     LEGAL AGREEMENTS
  ===================================================== */

  acceptedTerms: {
    type: Boolean,
    default: false
  },

  acceptedPrivacy: {
    type: Boolean,
    default: false
  },

  acceptedTermsAt: {
    type: Date,
    default: null
  },

  /* =====================================================
     SUBSCRIPTION
  ===================================================== */

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

  /* =====================================================
     USAGE TRACKING
  ===================================================== */

  usage: {
    postsToday: {
      type: Number,
      default: 0
    },

    lastPostDate: Date
  },

  /* =====================================================
     ACCOUNT STATUS
  ===================================================== */

  isActive: {
    type: Boolean,
    default: true
  },

  isSuspended: {
    type: Boolean,
    default: false
  },

  suspensionReason: {
    type: String,
    default: null
  },

  /* =====================================================
     SECURITY
  ===================================================== */

  lastLogin: Date,

  lastLoginIP: {
    type: String,
    default: null
  },

  loginHistory: [
    {
      ip: String,
      userAgent: String,
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],

  /* =====================================================
     ANTI-BRUTE FORCE (NEW)
  ===================================================== */

  failedLoginAttempts: {
    type: Number,
    default: 0
  },

  lockedUntil: {
    type: Date,
    default: null
  },

  /* =====================================================
     PROFILE
  ===================================================== */

  fullName: {
    type: String,
    default: ''
  },

  avatar: {
    type: String,
    default: null
  },

  /* =====================================================
     TIMESTAMPS
  ===================================================== */

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', UserSchema);
