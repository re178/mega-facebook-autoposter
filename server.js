require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const MongoStore = require('connect-mongo');

// ==================== MODELS ====================
const User = require('./models/User');
const Page = require('./models/Page');

// ==================== SERVICES ====================
const { startScheduler } = require('./services/scheduler');
const { startAiPostScheduler } = require('./services/aiPostScheduler');
const { startAutoMaintenance } = require('./services/autoMaintenance');

// ==================== ROUTES ====================
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const aiRoutes = require('./routes/aiSchedulerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userMessagesRoutes = require('./routes/userMessages');
const authRoutes = require('./routes/authRoutes');
const facebookAuthRoutes = require('./routes/facebookAuthRoutes');
const lipaRoutes = require('./routes/lipaRoutes');
const pricingRoutes = require('./routes/pricing');
const planRoutes = require('./routes/plans');
const emailRoutes = require('./routes/email');

// ==================== MIDDLEWARE ====================
const requireLogin = require('./middleware/requireLogin');
const requireAdmin = require('./middleware/requireAdmin');

// ==================== APP INIT ====================
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ⚠️ IMPORTANT: Do NOT add app.use(express.static('public')) here.
// It would expose protected HTML files (index.html, page.html, etc.)
// and bypass the requireLogin middleware.
// Protected pages are served via explicit routes with requireLogin below.

const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';
const serverStartTime = Date.now();

// ==================== STARTUP VALIDATION ====================
const requiredEnvVars = [
    'SESSION_SECRET',
    'MONGO_URI',
    'CLIENT_ORIGIN',
    'APP_URL',
    'INTASEND_PUBLISHABLE_KEY',
    'INTASEND_SECRET_KEY'
];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
}

// CORS origins – allow multiple origins
const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    process.env.CLIENT_ORIGIN ||
    'http://localhost:10000'
).split(',').map(o => o.trim());

// ==================== SECURITY HEADERS ====================
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdnjs.cloudflare.com"
                ],
                styleSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdnjs.cloudflare.com"
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "https://cdnjs.cloudflare.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https://res.cloudinary.com",
                    "https://*.cloudinary.com"
                ],
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
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                return callback(null, true);
            }
            const err = new Error('Not allowed by CORS');
            err.status = 403;
            return callback(err, false);
        },
        credentials: true
    })
);

// ==================== BODY PARSER (with raw body capture) ====================
// ⚠️ This must come BEFORE any route that needs rawBody (like webhooks)
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
        if (!req.rawBody) req.rawBody = buf.toString();
    }
}));

// ==================== SESSION ====================
app.use(
    session({
        name: 'voxtra.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            ttl: 2 * 60 * 60, // 2 hours
            autoRemove: 'native'
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

// ==================== WEBHOOKS (BEFORE CSRF) ====================
// Webhooks must be registered BEFORE CSRF protection
app.use('/', webhookRoutes);
app.use('/api/lipa', lipaRoutes);

// ==================== CSRF PROTECTION ====================
const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path === '/login') return next();
    if (req.path.startsWith('/api/lipa/callback')) return next();
    if (req.path.startsWith('/webhook')) return next();
    if (req.path.startsWith('/api/facebook/callback')) return next();

    const origin = req.get('Origin');
    const referer = req.get('Referer');
    const host = req.get('Host');

    try {
        if (origin) {
            const originHost = new URL(origin).host;
            const appHost = process.env.APP_URL?.replace(/^https?:\/\//, '');
            if (originHost === host || originHost === appHost) return next();
        }
        if (referer) {
            const refererHost = new URL(referer).host;
            const appHost = process.env.APP_URL?.replace(/^https?:\/\//, '');
            if (refererHost === host || refererHost === appHost) return next();
        }
    } catch {
        return res.status(403).json({ error: 'Invalid request origin' });
    }

    if (!origin && !referer) {
        if (req.session?.userId) return next();
        return res.status(403).json({ error: 'Missing origin/referer' });
    }

    return res.status(403).json({ error: 'Invalid request origin' });
};

app.use(csrfProtection);

// ==================== ROUTES ====================
app.use('/api/plans', planRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/facebook', facebookAuthRoutes);
app.use('/api/email', emailRoutes);

app.use('/api/dashboard', requireLogin, dashboardRoutes);
app.use('/api/dashboard', requireLogin, pageFeaturesRoutes);
app.use('/api/ai', requireLogin, aiRoutes);
app.use('/api/user/messages', requireLogin, userMessagesRoutes);
app.use('/api/admin', requireLogin, requireAdmin, adminRoutes);

// ==================== STATIC FILES ====================
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')));
// app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/favicon.ico'));
});
app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/robots.txt'));
});
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/manifest.json'));
});

app.get('/login', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/login.html'))
);
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

app.get('/index.html', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/index.html'))
);
app.get('/pages', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/page.html'))
);
app.get('/schedule', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/schedule.html'))
);
app.get('/connect-facebook', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/connect-facebook.html'))
);

app.get('/', (req, res) => {
    if (req.session?.userId) {
        res.redirect('/index.html');
    } else {
        res.redirect('/login');
    }
});

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

        if (user.createdAt > new Date('2025-01-01') && !user.isVerified) {
            return res.status(401).json({ error: 'Please verify your email before logging in.' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.status(500).json({ error: 'Session error' });
            }

            req.session.userId = user._id;
            req.session.userRole = user.role;

            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ error: 'Session error' });
                }

                res.json({
                    success: true,
                    redirect: '/index.html'
                });
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
        res.clearCookie('voxtra.sid');
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

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        timestamp: new Date().toISOString()
    });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path
    });
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    const message = isProduction ? 'Internal server error' : err.message;
    res.status(err.status || 500).json({
        error: message
    });
});

// ==================== GLOBAL PROCESS HANDLERS ====================
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection:', reason);
    process.exit(1);
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

// ==================== START ALL SCHEDULERS ====================
mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');

        await require('./routes/adminRoutes').ensureDefaultPlans();

        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            await syncPagesFromEnv(admin._id);
        }

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

        try {
            startAutoMaintenance();
            console.log('✅ Auto Maintenance started');
        } catch (err) {
            console.error('❌ Auto Maintenance error:', err.message);
        }

        try {
            require('./services/autoGeneration');
            console.log('✅ Auto Generation service loaded');
        } catch (err) {
            console.error('❌ Auto Generation service error:', err.message);
        }

        try {
            require('./services/reconciliation');
            console.log('✅ Reconciliation service loaded');
        } catch (err) {
            console.error('❌ Reconciliation service error:', err.message);
        }

        try {
            require('./services/monthlyReset');
            console.log('✅ Monthly Reset service loaded');
        } catch (err) {
            console.error('❌ Monthly Reset service error:', err.message);
        }

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
            console.log(`🧹 Auto Maintenance: Running every 30 minutes`);
            console.log(`💰 Pricing endpoint: /api/pricing`);
            console.log(`📋 Plans endpoint: /api/plans`);
            console.log(`📧 Email routes mounted at /api/email`);
            console.log(`🔒 Admin routes protected with requireAdmin`);
            console.log(`✅ CORS allowed origins: ${allowedOrigins.join(', ')}`);
        });

    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });
