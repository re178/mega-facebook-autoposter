require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const Page = require('./models/Page');
const User = require('./models/User'); // New User model

// -------------------- CREATE APP --------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- SESSION SETUP --------------------
app.use(
    session({
        name: 'fbposter.sid',
        secret: process.env.SESSION_SECRET || 'supersecret123',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            secure: false, // Render uses proxy HTTPS
            maxAge: 2 * 60 * 1000
        }
    })
);

// -------------------- ROUTES --------------------
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const aiRoutes = require('./routes/aiSchedulerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userMessagesRoutes = require('./routes/userMessages');

app.use('/', webhookRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dashboard', pageFeaturesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user/messages', require('./routes/userMessages'));

// -------------------- FRONTEND --------------------
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- AUTH MIDDLEWARE --------------------
function requireLogin(req, res, next) {
    if (req.session && req.session.userId) return next();
    return res.redirect('/login');
}

// -------------------- LOGIN & LOGOUT --------------------
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/login.html'))
);

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
            return res.send('<h2>Login failed. <a href="/login">Try again</a></h2>');
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.send('<h2>Login failed. <a href="/login">Try again</a></h2>');
        }

        req.session.userId = user._id;
        req.session.userRole = user.role;
        res.redirect('/index.html');
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('❌ Server error during login');
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

    try {

        if (!req.session.userId) {

            return res.json({
                loggedIn: false
            });

        }

        return res.json({
            loggedIn: true,
            userId: req.session.userId,
            role: req.session.userRole
        });

    } catch (err) {

        console.error('Session route error:', err);

        res.status(500).json({
            error: 'Session error'
        });

    }

});

// -------------------- PROTECTED PAGES --------------------
app.get('/index.html', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/index.html'))
);

app.get('/pages', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/page.html'))
);

app.get('/schedule', requireLogin, (req, res) =>
    res.sendFile(path.join(__dirname, 'public/schedule.html'))
);

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
                userId: adminId // Assign to admin by default
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

        // Start schedulers safely
        try {
            await startScheduler();
            await startAiPostScheduler();
        } catch (err) {
            console.error('❌ Scheduler error:', err.message);
        }

        app.listen(PORT, () =>
            console.log(`🚀 Server running on port ${PORT}`)
        );
    })
    .catch(err =>
        console.error('❌ MongoDB connection error:', err.message)
    );
