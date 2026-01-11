require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

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
  .then(() => {
    console.log('✅ MongoDB connected');
    // START SCHEDULER AFTER DB IS READY
    startScheduler();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });

