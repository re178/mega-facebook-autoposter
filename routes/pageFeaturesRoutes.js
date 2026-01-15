const express = require('express');
const router = express.Router();

// ===== MESSAGING =====
router.get('/page/:pageId/messages', async (req, res) => {
  res.json([]); // placeholder
});

router.get('/page/:pageId/templates', async (req, res) => {
  res.json([]);
});

// ===== ANALYTICS =====
router.get('/page/:pageId/insights', async (req, res) => {
  res.json({
    reach: { labels: [], datasets: [] },
    engagement: { labels: [], datasets: [] },
    followers: { labels: [], datasets: [] }
  });
});

// ===== ADS =====
router.get('/page/:pageId/ads', async (req, res) => {
  res.json([]);
});

// ===== COMMENTS =====
router.get('/page/:pageId/comments', async (req, res) => {
  res.json([]);
});

module.exports = router;
