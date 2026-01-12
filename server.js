require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
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

// ROUTES
const dashboardRoutes = require('./routes/dashboardRoutes');
// You may add pageRoutes later if needed

// SERVICES
const { startScheduler } = require('./services/scheduler');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVE FRONTEND
app.use(express.static(path.join(__dirname, 'public')));

// Serve the Pages HTML
app.get('/pages', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/page.html'));
});

// (Optional later) Serve Schedule HTML
app.get('/schedule', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/schedule.html'));
});

// ROUTES
app.use('/api/dashboard', dashboardRoutes);

// DATABASE CONNECTION
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

