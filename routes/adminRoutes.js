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
const Plan = require('../models/Plan');

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
// GET /admin/users (with pagination and search)
router.get('/users', async (req, res) => {
    try {
        const { skip = 0, limit = 20, search = '' } = req.query;
        const filter = {};
        if (search) {
            filter.$or = [
                { email: { $regex: search, $options: 'i' } },
                { fullName: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));
        const total = await User.countDocuments(filter);
        res.json({ users, total });
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

// PATCH /admin/users/:userId/restrictions
router.patch('/users/:userId/restrictions', async (req, res) => {
    try {
        const { postingRestricted, commentingRestricted, messagingRestricted, templatesLocked, adsLocked, autoGenerationLocked } = req.body;
        const updates = {};
        if (postingRestricted !== undefined) updates['restrictions.postingRestricted'] = postingRestricted;
        if (commentingRestricted !== undefined) updates['restrictions.commentingRestricted'] = commentingRestricted;
        if (messagingRestricted !== undefined) updates['restrictions.messagingRestricted'] = messagingRestricted;
        if (templatesLocked !== undefined) updates['restrictions.templatesLocked'] = templatesLocked;
        if (adsLocked !== undefined) updates['restrictions.adsLocked'] = adsLocked;
        if (autoGenerationLocked !== undefined) updates['restrictions.autoGenerationLocked'] = autoGenerationLocked;

        const user = await User.findByIdAndUpdate(req.params.userId, { $set: updates }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Log the action
        await Log.create({
            userId: req.session.userId,
            action: 'ADMIN_RESTRICTIONS_UPDATED',
            message: `Updated restrictions for ${user.email}`
        });

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /admin/users/:userId/override
router.patch('/users/:userId/override', async (req, res) => {
    try {
        const { feature, value } = req.body;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.featureOverrides) user.featureOverrides = new Map();
        user.featureOverrides.set(feature, value);
        await user.save();

        await Log.create({
            userId: req.session.userId,
            action: 'ADMIN_OVERRIDE_UPDATED',
            message: `Override for ${user.email}: ${feature} = ${value}`
        });

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
   PRICING MANAGEMENT (LEGACY – KEPT FOR BACKWARD COMPATIBILITY)
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

/* =====================================================
   PLAN MANAGEMENT (DYNAMIC PLANS)
===================================================== */

// GET all plans (including inactive)
router.get('/plans', async (req, res) => {
    try {
        const plans = await Plan.find().sort({ order: 1 });
        res.json(plans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET a single plan by ID
router.get('/plans/:id', async (req, res) => {
    try {
        const plan = await Plan.findById(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        res.json(plan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE a new plan
router.post('/plans', async (req, res) => {
    try {
        const { name, label, priceUSD, priceKES, durationDays, features, isActive, isDefault, order } = req.body;

        // Validate required fields
        if (!name || !label) {
            return res.status(400).json({ error: 'Name and label are required' });
        }

        // Check for duplicate name
        const existing = await Plan.findOne({ name });
        if (existing) {
            return res.status(400).json({ error: 'Plan name already exists' });
        }

        const plan = await Plan.create({
            name,
            label,
            priceUSD: priceUSD || 0,
            priceKES: priceKES || 0,
            durationDays: durationDays || 30,
            features: features || {},
            isActive: isActive !== undefined ? isActive : true,
            isDefault: isDefault || false,
            order: order || 0
        });

        res.status(201).json(plan);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE an existing plan
router.put('/plans/:id', async (req, res) => {
    try {
        const { name, label, priceUSD, priceKES, durationDays, features, isActive, isDefault, order } = req.body;

        const plan = await Plan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Prevent renaming the 'free' plan
        if (plan.name === 'free' && name && name !== 'free') {
            return res.status(400).json({ error: 'Cannot rename the "free" plan' });
        }

        // Check for duplicate name (excluding self)
        if (name && name !== plan.name) {
            const duplicate = await Plan.findOne({ name });
            if (duplicate) {
                return res.status(400).json({ error: 'Plan name already exists' });
            }
        }

        const updated = await Plan.findByIdAndUpdate(
            req.params.id,
            {
                name: name || plan.name,
                label: label || plan.label,
                priceUSD: priceUSD !== undefined ? priceUSD : plan.priceUSD,
                priceKES: priceKES !== undefined ? priceKES : plan.priceKES,
                durationDays: durationDays || plan.durationDays,
                features: features || plan.features,
                isActive: isActive !== undefined ? isActive : plan.isActive,
                isDefault: isDefault || plan.isDefault,
                order: order !== undefined ? order : plan.order
            },
            { new: true }
        );

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE (soft delete – sets isActive = false)
router.delete('/plans/:id', async (req, res) => {
    try {
        const plan = await Plan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Prevent deleting the 'free' plan
        if (plan.name === 'free') {
            return res.status(400).json({ error: 'Cannot delete the "free" plan' });
        }

        // Soft delete – set inactive
        plan.isActive = false;
        await plan.save();

        res.json({ success: true, message: 'Plan deactivated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   NEW: GLOBAL AUTO-GENERATION TOGGLE
===================================================== */
router.put('/auto-generation/global', async (req, res) => {
    try {
        const { enabled } = req.body;
        const settings = await SystemSettings.findOneAndUpdate(
            {},
            { $set: { 'autoGeneration.globalEnabled': enabled } },
            { new: true, upsert: true }
        );
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   NEW: ADMIN EMAIL SEND
===================================================== */
router.post('/email/send', async (req, res) => {
    try {
        const { userIds, subject, htmlContent } = req.body;
        let recipients = [];
        if (userIds === 'all') {
            const users = await User.find({}).select('email');
            recipients = users.map(u => u.email);
        } else if (Array.isArray(userIds)) {
            const users = await User.find({ _id: { $in: userIds } }).select('email');
            recipients = users.map(u => u.email);
        } else {
            return res.status(400).json({ error: 'Invalid recipients' });
        }

        if (!recipients.length) return res.status(400).json({ error: 'No recipients' });

        const { sendEmail } = require('../services/emailService');
        for (const email of recipients) {
            await sendEmail(email, subject, htmlContent);
        }

        await Log.create({
            userId: req.session.userId,
            action: 'ADMIN_EMAIL_SENT',
            message: `Sent email "${subject}" to ${recipients.length} users`
        });

        res.json({ success: true, sent: recipients.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   SEED DEFAULT PLANS (if none exist)
===================================================== */
const ensureDefaultPlans = async () => {
    const count = await Plan.countDocuments();
    if (count === 0) {
        const defaultPlans = [
            {
                name: 'free',
                label: 'Free',
                priceUSD: 0,
                priceKES: 0,
                durationDays: 30,
                features: {
                    aiTopics: 1,
                    aiPostsPerMonth: 5,
                    manualPostsPerMonth: 10,
                    pagesAllowed: 1,
                    templates: 0,
                    ads: false,
                    comments: false,
                    analyticsAdvanced: false,
                    pageProfile: false,
                    reports: false,
                    broadcastsSend: false,
                    teamMembers: 0
                },
                isActive: true,
                isDefault: true,
                order: 0
            },
            {
                name: 'pro',
                label: 'Pro',
                priceUSD: 29,
                priceKES: 3500,
                durationDays: 30,
                features: {
                    aiTopics: -1,
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: 10,
                    templates: 20,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: false,
                    teamMembers: 0
                },
                isActive: true,
                isDefault: false,
                order: 1
            },
            {
                name: 'premium',
                label: 'Premium',
                priceUSD: 59,
                priceKES: 7000,
                durationDays: 30,
                features: {
                    aiTopics: -1,
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: 50,
                    templates: 50,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: true,
                    teamMembers: 3
                },
                isActive: true,
                isDefault: false,
                order: 2
            },
            {
                name: 'enterprise',
                label: 'Enterprise',
                priceUSD: 99,
                priceKES: 12000,
                durationDays: 30,
                features: {
                    aiTopics: -1,
                    aiPostsPerMonth: -1,
                    manualPostsPerMonth: -1,
                    pagesAllowed: -1,
                    templates: -1,
                    ads: true,
                    comments: true,
                    analyticsAdvanced: true,
                    pageProfile: true,
                    reports: true,
                    broadcastsSend: true,
                    teamMembers: 5
                },
                isActive: true,
                isDefault: false,
                order: 3
            }
        ];
        await Plan.insertMany(defaultPlans);
        console.log('✅ Default plans seeded successfully.');
    }
};

// Export the seed function so it can be called from app.js
router.ensureDefaultPlans = ensureDefaultPlans;

module.exports = router;
