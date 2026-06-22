const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
      default: 'free'   // 'free' | 'pro' | 'enterprise'
    },
    startDate: {
      type: Date,
      default: null
    },
    expiryDate: {
      type: Date,
      default: null
    },
    // ✅ NEW: field required by frontend to track last upgrade date
    updatedAt: {
      type: Date,
      default: Date.now
    }
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
     ANTI-BRUTE FORCE
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
     🚀 MPESA WALLET & TRANSACTIONS (SAFE ADDITION)
  ===================================================== */
  walletBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [
    {
      type: {
        type: String,
        enum: ['deposit', 'payment', 'refund'],
        default: 'deposit'
      },
      amount: {
        type: Number,
        required: true
      },
      mpesaReceipt: {
        type: String,
        unique: true,
        sparse: true
      },
      checkoutRequestID: {
        type: String,
        index: true
      },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
      },
      description: {
        type: String,
        default: 'M-Pesa deposit'
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],

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

/* =====================================================
   HASH PASSWORD BEFORE SAVE
===================================================== */
UserSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  // Also update subscription.updatedAt if not set
  if (this.subscription && !this.subscription.updatedAt) {
    this.subscription.updatedAt = Date.now();
  }
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   PASSWORD COMPARISON METHOD
===================================================== */
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
