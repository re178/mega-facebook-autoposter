require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const Page = require('./models/Page');

// -------------------- CREATE APP --------------------
const app = express(); // MUST be before app.use
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
        cookie: {
            httpOnly: true,
            secure: false, // Render uses proxy HTTPS
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// -------------------- ROUTES --------------------
const dashboardRoutes = require('./routes/dashboardRoutes');
const pageFeaturesRoutes = require('./routes/pageFeaturesRoutes');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dashboard', pageFeaturesRoutes);

// -------------------- FRONTEND --------------------
app.use(express.static(path.join(__dirname, 'public')));

// Login & logout (DO NOT TOUCH)
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/login.html'))
);

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (
        email === process.env.APP_EMAIL &&
        password === process.env.APP_PASSWORD
    ) {
        req.session.user = email;
        return res.redirect('/index.html');
    }

    res.send('<h2>Login failed. <a href="/login">Try again</a></h2>');
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// -------------------- AUTH MIDDLEWARE --------------------
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.redirect('/login');
}

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

// -------------------- ENV PAGES SYNC --------------------
async function syncPagesFromEnv() {
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
                pageToken: p.pageToken
            });
            console.log(`✅ Page synced: ${p.name}`);
        }
    }
}

// -------------------- DATABASE --------------------
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
    .connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');
        await syncPagesFromEnv();
        startScheduler();
        app.listen(PORT, () =>
            console.log(`🚀 Server running on port ${PORT}`)
        );
    })
    .catch(err =>
        console.error('❌ MongoDB connection error:', err.message)
    );
