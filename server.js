require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const Page = require('./models/Page');
const User = require('./models/User');

// -------------------- CREATE APP --------------------
const app = express();

// -------------------- SECURITY MIDDLEWARE --------------------
app.use(helmet()); // Sets various HTTP headers for security

// Configure CORS (allow credentials)
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:10000',
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- SESSION SETUP (SECURE) --------------------
const isProduction = process.env.NODE_ENV === 'production';
app.use(
    session({
        name: 'fbposter.sid',
        secret: process.env.SESSION_SECRET || 'supersecret123',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            secure: isProduction, // true if using HTTPS
            sameSite: 'lax',
            maxAge: 2 * 60 * 1000 // 2 minutes
        }
    })
);

// -------------------- CSRF PROTECTION --------------------
// Generate CSRF token and make available to all routes
const csrfProtection = csrf({ cookie: false }); // use session, not cookie
app.use((req, res, next) => {
    // Skip CSRF for webhooks and login (login handles its own)
    if (req.path === '/webhook' || req.path === '/login') {
        return next();
    }
    csrfProtection(req, res, next);
});

// Expose CSRF token to views via meta tag (for all HTML pages)
app.use((req, res, next) => {
    if (req.csrfToken && !req.path.startsWith('/api')) {
        res.locals.csrfToken = req.csrfToken();
    }
    next();
});

// -------------------- RATE LIMITING --------------------
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter); // apply to all API routes

// Stricter limiter for login and broadcast
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts, try again later.' }
});
app.post('/login', authLimiter);
app.post('/api/admin/broadcast', authLimiter);

// -------------------- AUTH MIDDLEWARE FOR API ROUTES --------------------
function requireLogin(req, res, next) {
    if (req.session && req.session.userId) return next();
    // For API routes, return 401 instead of redirect
    if (req.path.startsWith('/api/') && req.path !== '/api/session') {
        return res.status(401).json({ error: 'Unauthorized, please login' });
    }
    // For web pages, redirect to login
    return res.redirect('/login');
}

// -------------------- ROUTES --------------------
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const aiRoutes = require('./routes/aiSchedulerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userMessagesRoutes = require('./routes/userMessages');

app.use('/', webhookRoutes);
app.use('/api/dashboard', requireLogin, dashboardRoutes);
app.use('/api/dashboard', requireLogin, pageFeaturesRoutes);
app.use('/api/ai', requireLogin, aiRoutes);
app.use('/api/admin', requireLogin, adminRoutes);
app.use('/api/user/messages', requireLogin, userMessagesRoutes);

// -------------------- FRONTEND STATIC FILES --------------------
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- HTML PAGES WITH CSRF TOKEN --------------------
function renderWithCsrf(filePath) {
    return (req, res) => {
        const html = require('fs').readFileSync(filePath, 'utf8');
        const csrfToken = req.csrfToken ? req.csrfToken() : '';
        const finalHtml = html.replace(
            '</head>',
            `<meta name="csrf-token" content="${csrfToken}">\n</head>`
        );
        res.send(finalHtml);
    };
}

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});
app.get('/index.html', requireLogin, renderWithCsrf(path.join(__dirname, 'public/index.html')));
app.get('/pages', requireLogin, renderWithCsrf(path.join(__dirname, 'public/page.html')));
app.get('/schedule', requireLogin, renderWithCsrf(path.join(__dirname, 'public/schedule.html')));

// -------------------- LOGIN (JSON RESPONSE FOR FRONTEND) --------------------
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid credentials or account disabled' });
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        req.session.userId = user._id;
        req.session.userRole = user.role;
        // Regenerate session ID to prevent fixation
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Session error' });
            return res.json({ success: true, redirect: '/index.html' });
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// -------------------- SESSION API --------------------
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

// -------------------- SERVICES --------------------
const { startScheduler } = require('./services/scheduler');
const { startAiPostScheduler } = require('./services/aiPostScheduler');

// -------------------- ENV PAGES SYNC --------------------
async function syncPagesFromEnv(adminId) {
    if (!process.env.PAGES_JSON) {
        console.log('ℹ️ No PAGES_JSON found, skipping page sync');
        return;
    }
    let pages;
    try {
        pages = JSON.parse(process.env.PAGES_JSON);
    } catch (err) {
        console.error('❌ Invalid PAGES_JSON format');
        return;
    }
    for (const p of pages) {
        if (!p.pageId || !p.name || !p.pageToken) continue;
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

// -------------------- DATABASE & START --------------------
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
    .connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');
        require('./services/queue');

        // Start schedulers
        try {
            await startScheduler();
            await startAiPostScheduler();
        } catch (err) {
            console.error('❌ Scheduler error:', err.message);
        }

        // Find admin user to sync pages (optional)
        const admin = await User.findOne({ role: 'admin' });
        if (admin) await syncPagesFromEnv(admin._id);

        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err.message));
