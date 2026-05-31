const moment = require('moment-timezone');
const mongoose = require('mongoose');

const AiTopic = require('../models/AiTopic');
const AiScheduledPost = require('../models/AiScheduledPost');
const AiLog = require('../models/AiLog');

const TIMEZONE = 'Africa/Nairobi';
const MAX_POSTS_PER_TOPIC = 5;

// ==============================
// STRICT TOPIC ENFORCER CRON
// ==============================
async function runMaintenance() {
  const now = moment().tz(TIMEZONE);

  try {
    console.log("🧹 AUTO MAINTENANCE RUNNING...");

    // ==============================
    // 1. FETCH ALL TOPICS
    // ==============================
    const topics = await AiTopic.find({}).lean();

    for (const topic of topics) {
      try {

        // ==============================
        // 2. CORRUPTED TOPIC CHECK
        // ==============================
        if (
          !topic.topicName ||
          !topic.pageId ||
          !topic.startDate ||
          !topic.endDate
        ) {
          await deleteTopic(topic._id, "CORRUPTED_TOPIC");
          continue;
        }

        // ==============================
        // 3. EXPIRED TOPIC CHECK (GRACE 2 DAYS)
        // ==============================
        const end = moment(topic.endDate).tz(TIMEZONE);

        if (end.isValid() && end.clone().add(2, 'days').isBefore(now)) {
          await deleteTopic(topic._id, "EXPIRED_TOPIC");
          continue;
        }

        // ==============================
        // 4. LOG-BASED ACTIVITY CHECK
        // ==============================
        const logCount = await AiLog.countDocuments({
          topicId: topic._id,
          action: "AUTO_POST_CREATED"
        });

        if (logCount >= MAX_POSTS_PER_TOPIC) {
          await deleteTopic(topic._id, "MAX_POSTS_REACHED");
          continue;
        }

        // ==============================
        // 5. ORPHAN CHECK
        // ==============================
        const hasLogs = await AiLog.exists({ topicId: topic._id });
        const hasPosts = await AiScheduledPost.exists({ topicId: topic._id });

        if (!hasLogs && !hasPosts) {
          await deleteTopic(topic._id, "ORPHAN_TOPIC");
          continue;
        }

      } catch (err) {
        console.error("Topic check error:", topic._id, err.message);
      }
    }

    // ==============================
    // 6. CLEAN NON-AUTO LOGS
    // ==============================
    const cutoff = moment().subtract(30, 'minutes').toDate();

    await AiLog.deleteMany({
      createdAt: { $lt: cutoff },
      action: { $not: /^AUTO_/ }
    });

    console.log("🧹 AUTO MAINTENANCE COMPLETED");

  } catch (err) {
    console.error("FATAL MAINTENANCE ERROR:", err.message);
  }
}

// ==============================
// SAFE DELETE FUNCTION
// ==============================
async function deleteTopic(topicId, reason) {
  try {
    await AiLog.deleteMany({ topicId });
    await AiScheduledPost.deleteMany({ topicId });
    await AiTopic.deleteOne({ _id: topicId });

    console.log(`❌ TOPIC DELETED [${reason}] ->`, topicId);
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
  }
}

// ==============================
// CRON STARTER
// ==============================
function startAutoMaintenance() {
  console.log("🚀 AUTO MAINTENANCE STARTED");

  setInterval(runMaintenance, 30 * 60 * 1000); // every 30 minutes
  runMaintenance(); // run immediately
}

module.exports = {
  startAutoMaintenance
};
