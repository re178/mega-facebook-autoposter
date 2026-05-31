require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const MongoStore = require('connect-mongo');

// ==================== MODELS ====================
const User = require('./models/User');
const Page = require('./models/Page');

// ==================== APP INIT ====================
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';

// ==================== SECURITY HEADERS ====================
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
                connectSrc: [
                    "'self'",
                    "https://graph.facebook.com",
                    "https://api.openai.com"
                ],
            },
        },
    })
);

// ==================== CORS ====================
app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:10000',
        credentials: true
    })
);

// ==================== BODY PARSER ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== SESSION (STABLE FOR FACEBOOK OAUTH) ====================
app.use(
    session({
        name: 'voxtra.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI
        }),
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 2 * 60 * 60 * 1000 // 2 hours
        }
    })
);

// ==================== RATE LIMITING ====================
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, try later' }
});

app.use('/api', apiLimiter);
app.post('/login', authLimiter);
app.post('/api/auth/signup', authLimiter);
app.post('/api/auth/forgot-password', authLimiter);
app.post('/api/auth/reset-password', authLimiter);

// ==================== AUTH MIDDLEWARE ====================
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();

    if (req.path.startsWith('/api')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
}

// ==================== ROUTES ====================
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const aiRoutes = require('./routes/aiSchedulerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userMessagesRoutes = require('./routes/userMessages');
const authRoutes = require('./routes/authRoutes');
const facebookAuthRoutes = require('./routes/facebookAuthRoutes');

// Public webhook (no auth)
app.use('/', webhookRoutes);

// Public auth routes (no login required)
app.use('/api/auth', authRoutes);

// Facebook OAuth routes (handle auth internally)
app.use('/api/facebook', facebookAuthRoutes);

// Protected API routes (require login)
app.use('/api/dashboard', requireLogin, dashboardRoutes);
app.use('/api/dashboard', requireLogin, pageFeaturesRoutes);
app.use('/api/ai', requireLogin, aiRoutes);
app.use('/api/admin', requireLogin, adminRoutes);
app.use('/api/user/messages', requireLogin, userMessagesRoutes);

// ==================== STATIC FILES ====================
app.use(express.static(path.join(__dirname, 'public')));

// ==================== FRONTEND PAGES ====================
app.get('/login', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/login.html'))
);

// Protected pages (no CSRF injection needed)
app.get('/connect-facebook', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/connect-facebook.html'))
);
app.get('/index.html', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/index.html'))
);
app.get('/pages', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/page.html'))
);
app.get('/schedule', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/schedule.html'))
);

// Auth pages
app.get('/signup', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/signup.html'))
);
app.get('/forgot-password', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/forgot-password.html'))
);
app.get('/reset-password', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/reset-password.html'))
);
app.get('/verify-email', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/verify-email.html'))
);

// Legal pages
app.get('/privacy', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/privacy.html'))
);
app.get('/terms', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/terms.html'))
);
app.get('/cookies', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/cookies.html'))
);
app.get('/data-deletion', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/data-deletion.html'))
);
app.get('/community-guidelines', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/community-guidelines.html'))
);

// ==================== LOGIN ====================
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid account' });
        }

        // Check if user is verified (new signups after Jan 1 2025)
        if (user.createdAt > new Date('2025-01-01') && !user.isVerified) {
            return res.status(401).json({ error: 'Please verify your email before logging in.' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user._id;
        req.session.userRole = user.role;

        req.session.save(err => {
            if (err) return res.status(500).json({ error: 'Session error' });

            res.json({
                success: true,
                redirect: '/index.html'
            });
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== LOGOUT ====================
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ==================== SESSION CHECK ====================
app.get('/api/session', (req, res) => {
    if (!req.session.userId) {
        return res.json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        userId: req.session.userId,
        role: req.session.userRole
    });
});

// ==================== ENV PAGE SYNC ====================
async function syncPagesFromEnv(adminId) {
    if (!process.env.PAGES_JSON) return;

    let pages;
    try {
        pages = JSON.parse(process.env.PAGES_JSON);
    } catch (err) {
        console.error('Invalid PAGES_JSON');
        return;
    }

    for (const p of pages) {
        if (!p.pageId || !p.pageToken) continue;

        const exists = await Page.findOne({ pageId: p.pageId });

        if (!exists) {
            await Page.create({
                name: p.name,
                pageId: p.pageId,
                pageToken: p.pageToken,
                userId: adminId
            });

            console.log(`✅ Page synced: ${p.name}`);
        }
    }
}

// ==================== START SCHEDULERS ====================
const { startScheduler } = require('./services/scheduler');
const { startAiPostScheduler } = require('./services/aiPostScheduler');

// ==================== DATABASE CONNECTION & SERVER START ====================
mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');

        // Find admin user for page sync (if any)
        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            await syncPagesFromEnv(admin._id);
        }

        // Start both schedulers
        try {
            startScheduler();
            console.log('✅ Regular scheduler started');
        } catch (err) {
            console.error('❌ Regular scheduler error:', err.message);
        }

        try {
            startAiPostScheduler();
            console.log('✅ AI Post scheduler started');
        } catch (err) {
            console.error('❌ AI Post scheduler error:', err.message);
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });
