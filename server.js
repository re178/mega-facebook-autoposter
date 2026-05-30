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

// ---------------- MODELS ----------------
const Page = require('./models/Page');
const User = require('./models/User');

// ---------------- APP INIT ----------------
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === 'production';

// ---------------- SECURITY HEADERS ----------------
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
                connectSrc: ["'self'", "https://graph.facebook.com", "https://api.openai.com"],
            },
        },
    })
);

// ---------------- CORS ----------------
app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:10000',
        credentials: true
    })
);

// ---------------- BODY PARSERS ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- SESSION ----------------
app.use(
    session({
        name: 'fbposter.sid',
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

// ---------------- RATE LIMITING ----------------
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

// ---------------- REMOVE CSRF بالكامل ----------------
// (intentionally removed - FIXES YOUR ERROR)

// ---------------- AUTH MIDDLEWARE ----------------
function requireLogin(req, res, next) {
    if (req.session?.userId) return next();

    if (req.path.startsWith('/api')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.redirect('/login');
}

// ---------------- ROUTES ----------------
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const aiRoutes = require('./routes/aiSchedulerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userMessagesRoutes = require('./routes/userMessages');
const authRoutes = require('./routes/authRoutes');
const facebookAuthRoutes = require('./routes/facebookAuthRoutes');

app.use('/', webhookRoutes);
app.use('/api/dashboard', requireLogin, dashboardRoutes);
app.use('/api/dashboard', requireLogin, pageFeaturesRoutes);
app.use('/api/ai', requireLogin, aiRoutes);
app.use('/api/admin', requireLogin, adminRoutes);
app.use('/api/user/messages', requireLogin, userMessagesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/facebook', requireLogin, facebookAuthRoutes);

// ---------------- STATIC FILES ----------------
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- HTML PAGES ----------------
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/connect-facebook', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/connect-facebook.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/signup.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/reset-password.html'));
});

app.get('/verify-email', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/verify-email.html'));
});

// ---------------- LEGAL PAGES ----------------
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/terms.html'));
});

app.get('/cookies', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/cookies.html'));
});

app.get('/data-deletion', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/data-deletion.html'));
});

app.get('/community-guidelines', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/community-guidelines.html'));
});

// ---------------- PROTECTED PAGES ----------------
function render(file) {
    return (req, res) => {
        res.sendFile(path.join(__dirname, 'public', file));
    };
}

app.get('/index.html', requireLogin, render('index.html'));
app.get('/pages', requireLogin, render('page.html'));
app.get('/schedule', requireLogin, render('schedule.html'));

// ---------------- LOGIN ----------------
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid account' });
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
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ---------------- LOGOUT ----------------
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ---------------- SESSION CHECK ----------------
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

// ---------------- DB CONNECT ----------------
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected');

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB error:', err.message);
    });
