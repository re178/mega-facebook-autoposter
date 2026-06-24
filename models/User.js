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
     PAYMENT PHONE (separate from general phone)
  ===================================================== */
  paymentPhone: {
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
    plan: {
      type: String,
      default: 'free'   // 'free' | 'pro' | 'premium' | 'enterprise'
    },
    status: {
      type: String,
      enum: ['free', 'active', 'expired'],
      default: 'free'
    },
    startDate: {
      type: Date,
      default: null
    },
    expiryDate: {
      type: Date,
      default: null
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    autoRenew: {
      type: Boolean,
      default: false
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
     AI LOCK
  ===================================================== */
  aiLocked: {
    type: Boolean,
    default: false
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
     🚀 WALLET & TRANSACTIONS (UPDATED ENUM)
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
        enum: ['deposit', 'payment', 'refund', 'subscription'], // ✅ ADDED 'subscription'
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
      invoiceId: {
        type: String,
        index: true,
        sparse: true
      },
      trackingId: {
        type: String,
        index: true,
        sparse: true
      },
      idempotencyKey: {
        type: String,
        index: true,
        sparse: true
      },
      plan: {
        type: String,
        enum: ['free', 'pro', 'premium', 'enterprise'],
        default: null
      },
      subscriptionActivated: {
        type: Boolean,
        default: false
      },
      subscriptionExpiry: {
        type: Date,
        default: null
      },
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
      },
      description: {
        type: String,
        default: 'M-Pesa deposit'
      },
      phoneNumber: {
        type: String,
        default: null
      },
      webhookReceived: {
        type: Boolean,
        default: false
      },
      webhookData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },
      intasendResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: null
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
