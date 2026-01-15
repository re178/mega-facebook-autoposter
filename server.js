require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const Page = require('./models/Page');

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

// -------------------- ROUTES --------------------
const dashboardRoutes = require('./routes/dashboardRoutes');



// -------------------- SERVICES --------------------
const { startScheduler } = require('./services/scheduler');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- SESSION SETUP --------------------
app.use(session({
    name: 'fbposter.sid',
    secret: process.env.SESSION_SECRET || 'supersecret123',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // set true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// -------------------- LOGIN --------------------

// Redirect root URL to login
app.get('/', (req, res) => res.redirect('/login'));

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Handle login POST
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const envEmail = process.env.APP_EMAIL;
    const envPassword = process.env.APP_PASSWORD;

    if (email === envEmail && password === envPassword) {
        req.session.user = email;
        res.redirect('/index.html');
    } else {
        res.send('<h2>Login failed. <a href="/login">Try again</a></h2>');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// Middleware to protect routes
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.redirect('/login');
}

// -------------------- SERVE FRONTEND --------------------
app.use(express.static(path.join(__dirname, 'public')));

// Protect index.html
app.get('/index.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Protected Pages
app.get('/pages', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/page.html'));
});

// Protected Schedule
app.get('/schedule', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/schedule.html'));
});

// -------------------- DASHBOARD API --------------------
app.use('/api/dashboard', dashboardRoutes);

// -------------------- DATABASE CONNECTION --------------------
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    await syncPagesFromEnv(); 

    startScheduler();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });
