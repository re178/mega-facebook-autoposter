const express = require('express');
const bcrypt = require('bcrypt');

const router = express.Router();

// MODELS
const User = require('../models/User');
const Page = require('../models/Page');
const Post = require('../models/Post');
const Log = require('../models/Log');
const AiLog = require('../models/AiLog');
const AiScheduledPost = require('../models/AiScheduledPost');
const SystemSettings = require('../models/SystemSettings');
const AdminMessage = require('../models/AdminMessage');
const BroadcastMessage = require('../models/BroadcastMessage');

// MIDDLEWARE
const requireLogin = require('../middleware/requireLogin');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireLogin);
router.use(requireAdmin);

/* =====================================================
   ADMIN DASHBOARD STATS
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

            const postCount = await Post.countDocuments({
                pageId: { $in: pageIds }
            });

            postsPerUser.push({
                userId: user._id,
                email: user.email,
                posts: postCount
            });
        }

        res.json({
            totalUsers,
            activeUsers,
            suspendedUsers,
            totalPages,
            totalPosts,
            totalAiPosts,
            postsPerUser
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   GET ALL USERS
===================================================== */

router.get('/users', async (req, res) => {

    try {

        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });

        res.json(users);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   CREATE USER + PAGES
===================================================== */

router.post('/users', async (req, res) => {

    try {

        const {
            email,
            password,
            role,
            phone,
            subscription,
            pages
        } = req.body;

        const exists = await User.findOne({
            email: email.toLowerCase()
        });

        if (exists) {
            return res.status(400).json({
                error: 'Email already exists'
            });
        }

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

                if (!p.pageId || !p.name || !p.pageToken) {
                    continue;
                }

                await Page.create({
                    name: p.name,
                    pageId: p.pageId,
                    pageToken: p.pageToken,
                    userId: user._id
                });
            }
        }

        res.json({
            success: true,
            user
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   EDIT USER
===================================================== */

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

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            updates,
            { new: true }
        ).select('-password');

        res.json(user);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   SUSPEND USER
===================================================== */

router.patch('/users/:userId/suspend', async (req, res) => {

    try {

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { isActive: false },
            { new: true }
        );

        res.json({
            success: true,
            user
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   REACTIVATE USER
===================================================== */

router.patch('/users/:userId/reactivate', async (req, res) => {

    try {

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { isActive: true },
            { new: true }
        );

        res.json({
            success: true,
            user
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   DELETE USER
===================================================== */

router.delete('/users/:userId', async (req, res) => {

    try {

        const user = await User.findById(req.params.userId);

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const pages = await Page.find({
            userId: user._id
        });

        const pageIds = pages.map(p => p._id);

        await Post.deleteMany({
            pageId: { $in: pageIds }
        });

        await AiScheduledPost.deleteMany({
            pageId: { $in: pageIds }
        });

        await Page.deleteMany({
            userId: user._id
        });

        await User.findByIdAndDelete(user._id);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   RESET PASSWORD
===================================================== */

router.patch('/users/:userId/reset-password', async (req, res) => {

    try {

        const { newPassword } = req.body;

        const hashed = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(
            req.params.userId,
            {
                password: hashed,
                lastPasswordReset: new Date()
            }
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   LOCK AI
===================================================== */

router.patch('/users/:userId/lock-ai', async (req, res) => {

    try {

        await User.findByIdAndUpdate(
            req.params.userId,
            { aiLocked: true }
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   UNLOCK AI
===================================================== */

router.patch('/users/:userId/unlock-ai', async (req, res) => {

    try {

        await User.findByIdAndUpdate(
            req.params.userId,
            { aiLocked: false }
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   GET ALL PAGES WITH OWNERS
===================================================== */

router.get('/pages', async (req, res) => {

    try {

        const pages = await Page.find()
            .populate('userId', 'email role phone')
            .sort({ createdAt: -1 });

        res.json(pages);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ADD PAGE FOR USER
===================================================== */

router.post('/pages', async (req, res) => {

    try {

        const {
            name,
            pageId,
            pageToken,
            userId
        } = req.body;

        const page = await Page.create({
            name,
            pageId,
            pageToken,
            userId
        });

        res.json(page);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   EDIT PAGE
===================================================== */

router.put('/pages/:pageMongoId', async (req, res) => {

    try {

        const page = await Page.findByIdAndUpdate(
            req.params.pageMongoId,
            req.body,
            { new: true }
        );

        res.json(page);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   DELETE PAGE
===================================================== */

router.delete('/pages/:pageMongoId', async (req, res) => {

    try {

        await Page.findByIdAndDelete(req.params.pageMongoId);

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   SEND USER MESSAGE
===================================================== */

router.post('/message/:userId', async (req, res) => {

    try {

        const message = await AdminMessage.create({
            userId: req.params.userId,
            message: req.body.message
        });

        res.json(message);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   BROADCAST MESSAGE
===================================================== */

router.post('/broadcast', async (req, res) => {

    try {

        const broadcast = await BroadcastMessage.create({
            message: req.body.message
        });

        res.json(broadcast);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   GET SYSTEM LOGS
===================================================== */

router.get('/logs', async (req, res) => {

    try {

        const logs = await Log.find()
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('pageId');

        const aiLogs = await AiLog.find()
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            logs,
            aiLogs
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   FORCE PUBLISH POST
===================================================== */

router.patch('/posts/:postId/force-publish', async (req, res) => {

    try {

        const post = await Post.findByIdAndUpdate(
            req.params.postId,
            {
                status: 'POSTED',
                postedAt: new Date()
            },
            { new: true }
        );

        res.json(post);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   DELETE ANY POST
===================================================== */

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

        if (!settings) {
            settings = await SystemSettings.create({
                maintenanceMode: true
            });
        }
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

        if (!settings) {
            settings = await SystemSettings.create({
                maintenanceMode: false
            });
        }
        else {
            settings.maintenanceMode = false;
            await settings.save();
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
