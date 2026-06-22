const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// Models
const User = require('../models/User');
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');
const AiLog = require('../models/AiLog');
const AiScheduledPost = require('../models/AiScheduledPost');
const SystemSettings = require('../models/SystemSettings');
const AdminMessage = require('../models/AdminMessage');
const BroadcastMessage = require('../models/BroadcastMessage');

// Middleware (fixed versions – return JSON 401 for API routes)
const requireLogin = require('../middleware/requireLogin');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireLogin);
router.use(requireAdmin);

/* =====================================================
   DASHBOARD STATS
===================================================== */
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const suspendedUsers = await User.countDocuments({ isActive: false });
        const totalPages = await Page.countDocuments();
        const totalPosts = await Post.countDocuments();
        const totalAiPosts = await AiScheduledPost.countDocuments();

        const users = await User.find().select('-password');
        const postsPerUser = [];
        for (const user of users) {
            const pages = await Page.find({ userId: user._id });
            const pageIds = pages.map(p => p._id);
            const postCount = await Post.countDocuments({ pageId: { $in: pageIds } });
            postsPerUser.push({ userId: user._id, email: user.email, posts: postCount });
        }

        res.json({ totalUsers, activeUsers, suspendedUsers, totalPages, totalPosts, totalAiPosts, postsPerUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   USERS
===================================================== */
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single user (needed for edit modal)
router.get('/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/users', async (req, res) => {
    try {
        const { email, password, role, phone, subscription, pages } = req.body;
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(400).json({ error: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            role: role || 'user',
            phone,
            subscription
        });

        if (Array.isArray(pages)) {
            for (const p of pages) {
                if (!p.pageId || !p.name || !p.pageToken) continue;
                await Page.create({ name: p.name, pageId: p.pageId, pageToken: p.pageToken, userId: user._id });
            }
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/users/:userId', async (req, res) => {
    try {
        const updates = {
            email: req.body.email,
            role: req.body.role,
            phone: req.body.phone,
            subscription: req.body.subscription,
            isActive: req.body.isActive,
            aiLocked: req.body.aiLocked
        };
        const user = await User.findByIdAndUpdate(req.params.userId, updates, { new: true }).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:userId/suspend', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.userId, { isActive: false }, { new: true });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:userId/reactivate', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.userId, { isActive: true }, { new: true });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const pages = await Page.find({ userId: user._id });
        const pageIds = pages.map(p => p._id);
        await Post.deleteMany({ pageId: { $in: pageIds } });
        await AiScheduledPost.deleteMany({ pageId: { $in: pageIds } });
        await Page.deleteMany({ userId: user._id });
        await User.findByIdAndDelete(user._id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:userId/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        const hashed = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(req.params.userId, { password: hashed, lastPasswordReset: new Date() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:userId/lock-ai', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { aiLocked: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:userId/unlock-ai', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { aiLocked: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   PAGES
===================================================== */
router.get('/pages', async (req, res) => {
    try {
        const pages = await Page.find().populate('userId', 'email role phone').sort({ createdAt: -1 });
        res.json(pages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single page (including token) – used by frontend edit modal
router.get('/pages/:pageId', async (req, res) => {
    try {
        const page = await Page.findById(req.params.pageId);
        if (!page) return res.status(404).json({ error: 'Page not found' });
        res.json(page);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/pages', async (req, res) => {
    try {
        const { name, pageId, pageToken, userId } = req.body;
        const page = await Page.create({ name, pageId, pageToken, userId });
        res.json(page);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/pages/:pageId', async (req, res) => {
    try {
        const page = await Page.findByIdAndUpdate(req.params.pageId, req.body, { new: true });
        res.json(page);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/pages/:pageId', async (req, res) => {
    try {
        await Page.findByIdAndDelete(req.params.pageId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   PRIVATE MESSAGES
===================================================== */
router.post('/message/:userId', async (req, res) => {
    try {
        const message = await AdminMessage.create({ userId: req.params.userId, message: req.body.message });
        res.json(message);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/messages', async (req, res) => {
    try {
        const { userId } = req.query;
        const filter = userId ? { userId } : {};
        const messages = await AdminMessage.find(filter).populate('userId', 'email').sort({ createdAt: -1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/message/:id', async (req, res) => {
    try {
        const { message } = req.body;
        const updated = await AdminMessage.findByIdAndUpdate(req.params.id, { message, updatedAt: new Date() }, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/message/:id', async (req, res) => {
    try {
        await AdminMessage.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   BROADCAST MESSAGES
===================================================== */
router.post('/broadcast', async (req, res) => {
    try {
        const broadcast = await BroadcastMessage.create({ message: req.body.message });
        res.json(broadcast);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/broadcast', async (req, res) => {
    try {
        const broadcasts = await BroadcastMessage.find().sort({ createdAt: -1 });
        res.json(broadcasts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/broadcast/:id', async (req, res) => {
    try {
        const { message } = req.body;
        const updated = await BroadcastMessage.findByIdAndUpdate(req.params.id, { message, updatedAt: new Date() }, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/broadcast/:id', async (req, res) => {
    try {
        await BroadcastMessage.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   LOGS
===================================================== */
router.get('/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(100).populate('pageId');
        const aiLogs = await AiLog.find().sort({ createdAt: -1 }).limit(100);
        res.json({ logs, aiLogs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/logs/:logId', async (req, res) => {
    try {
        await Log.findByIdAndDelete(req.params.logId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/ai-logs/:logId', async (req, res) => {
    try {
        await AiLog.findByIdAndDelete(req.params.logId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/logs/clear-all', async (req, res) => {
    try {
        await Log.deleteMany({});
        await AiLog.deleteMany({});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   POSTS (Admin overrides)
===================================================== */
router.patch('/posts/:postId/force-publish', async (req, res) => {
    try {
        const post = await Post.findByIdAndUpdate(req.params.postId, { status: 'POSTED', postedAt: new Date() }, { new: true });
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/posts/:postId', async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.postId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   MAINTENANCE MODE
===================================================== */
router.patch('/maintenance/on', async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) settings = await SystemSettings.create({ maintenanceMode: true });
        else {
            settings.maintenanceMode = true;
            await settings.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/maintenance/off', async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) settings = await SystemSettings.create({ maintenanceMode: false });
        else {
            settings.maintenanceMode = false;
            await settings.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   NEW: PRICING MANAGEMENT
===================================================== */
router.get('/pricing', async (req, res) => {
    try {
        const settings = await SystemSettings.findOne();
        const pricing = settings?.pricing || {
            pro: { priceUSD: 29, priceKES: 3500 },
            enterprise: { priceUSD: 99, priceKES: 12000 }
        };
        res.json(pricing);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/pricing', async (req, res) => {
    try {
        const { pro, enterprise } = req.body;
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings({ pricing: { pro, enterprise } });
        } else {
            settings.pricing = { pro, enterprise };
        }
        await settings.save();
        res.json({ success: true, pricing: settings.pricing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
