const moment = require('moment-timezone');
const {
  AiTopic,
  AiScheduledPost,
  AiLog,
  PageProfile,
  monitor,
  MAX_SCHEDULED_POSTS,
  MIN_ACTIVE_TOPICS,
  TOPIC_LIFETIME_DAYS,
  POSTS_PER_DAY_AUTO,
  INCLUDE_MEDIA_AUTO,
  DEFAULT_ANGLES,
  getGlobalSettings,
  TIMEZONE,
} = require('./models');
const {
  generateAndValidatePost,
  generateImage,
  createBrandedImage,
} = require('./providers');
const {
  generateCustomAngles,
  generateShortTopicName,
  fetchTrendingHeadline,
  isTopicTooSimilar,
  getIntelligentStartDate,
  getNonCollidingTime,
  evaluateTopicQuality,
  getUsedAnglesCount,
  expireTopicIfComplete,
} = require('./topicUtils');
const pageIntelligence = require('../pageIntelligence');
const { discoverAndRank } = require('../topicEngine');

// ========================================================================
//  MANUAL TOPIC CREATION
// ========================================================================
async function createManualTopicWithQA(
  pageId,
  topicName,
  startDate,
  endDate,
  times,
  postsPerDay,
  includeMedia,
  includeVideo
) {
  // Enforce global max active topics
  const settings = await getGlobalSettings();
  const maxActive = settings.maxActiveTopics;
  const activeTopicsCount = await AiTopic.countDocuments({
    pageId,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });
  if (activeTopicsCount >= maxActive) {
    await monitor(
      null,
      pageId,
      null,
      'MANUAL_TOPIC_REJECTED_MAX_ACTIVE',
      `Already have ${activeTopicsCount} active topics (max ${maxActive})`
    );
    return {
      success: false,
      reason: `Maximum active topics (${maxActive}) reached. Please end some topics first.`,
    };
  }

  // Quality checks
  const { topicScore, pageFit } = await evaluateTopicQuality(topicName, pageId);
  if (topicScore < 20) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic score too low (${topicScore})`);
    return {
      success: false,
      reason: `Topic score too low (${topicScore}). Choose a more specific or trending topic.`,
    };
  }
  if (pageFit < 30) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Topic relevance low (${pageFit})`);
    return {
      success: false,
      reason: `Topic not relevant enough to page interests (${pageFit}/100).`,
    };
  }

  // Similarity check
  if (await isTopicTooSimilar(topicName, pageId)) {
    await monitor(null, pageId, null, 'MANUAL_TOPIC_REJECTED', `Similar topic exists: ${topicName}`);
    return { success: false, reason: `Similar topic already exists. Choose a different topic.` };
  }

  // Generate angles
  const customAngles = await generateCustomAngles(topicName, pageId);

  // Create topic
  const newTopic = await AiTopic.create({
    topicName,
    pageId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    times: Array.isArray(times) ? times : [times],
    postsPerDay: postsPerDay || 1,
    includeMedia: includeMedia || false,
    includeVideo: includeVideo || false,
    customAngles: customAngles || null,
    manualTopic: true,
  });

  await monitor(
    newTopic._id,
    pageId,
    null,
    'MANUAL_TOPIC_CREATED',
    `Topic: "${topicName}", Angles: ${customAngles?.join(', ') || 'defaults'}, Scores: topic=${topicScore}, fit=${pageFit}`
  );

  return { success: true, topic: newTopic, topicScore, pageFit, customAngles };
}

// ========================================================================
//  GENERATE POSTS FOR A MANUAL TOPIC (all angles at once)
// ========================================================================
async function generatePostsForManualTopic(topicId, generateImmediately = false) {
  const topic = await AiTopic.findById(topicId);
  if (!topic) return { success: false, reason: 'Topic not found' };

  const usedCount = await getUsedAnglesCount(topic._id);
  let anglesToUse = topic.customAngles && topic.customAngles.length
    ? topic.customAngles
    : await generateCustomAngles(topic.topicName, topic.pageId);
  if (!anglesToUse) anglesToUse = [...DEFAULT_ANGLES];
  while (anglesToUse.length < 5) anglesToUse.push(DEFAULT_ANGLES[anglesToUse.length % DEFAULT_ANGLES.length]);

  const totalAngles = anglesToUse.length;
  if (usedCount >= totalAngles) {
    await expireTopicIfComplete(topic);
    return { success: false, reason: 'All angles already used. Topic expired.' };
  }

  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' })
    .sort({ scheduledTime: -1 })
    .limit(10)
    .select('text')
    .lean();
  const recentPostTexts = recentPosts.map((p) => p.text).filter(Boolean);

  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  const created = [];
  let angleIndex = usedCount;

  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      if (angleIndex >= totalAngles) break;
      const angle = anglesToUse[angleIndex];
      const time = topic.times[i % topic.times.length];
      const scheduled = moment.tz(`${day.format('YYYY-MM-DD')} ${time}`, TIMEZONE).toDate();

      const existsScheduled = await AiScheduledPost.findOne({ topicId, scheduledTime: scheduled });
      if (existsScheduled) continue;

      // Enrich context
      const context = await pageIntelligence.enrichContext(
        topic.pageId,
        pageProfile,
        topic.topicName,
        recentPostTexts
      );

      const validatedPost = await generateAndValidatePost(
        topic.topicName,
        angle,
        topic.pageId,
        pageProfile,
        recentPostTexts,
        context.dna,
        context.topHeadline,
        context.contentType
      );
      if (!validatedPost) {
        await monitor(topicId, topic.pageId, null, 'MANUAL_POST_FAILED', `Angle: ${angle} - Failed QA`);
        continue;
      }

      let rawMediaUrl = null;
      if (topic.includeMedia) rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
      let finalMediaUrl = null;
      if (rawMediaUrl || topic.includeVideo) finalMediaUrl = await createBrandedImage(
        topicId,
        topic.pageId,
        rawMediaUrl,
        validatedPost.text
      );

      const post = await AiScheduledPost.create({
        topicId,
        pageId: topic.pageId,
        text: validatedPost.text,
        mediaUrl: finalMediaUrl,
        scheduledTime: scheduled,
        status: generateImmediately ? 'PENDING' : 'PENDING',
        meta: {
          angle,
          qaScore: validatedPost.score,
          qaBreakdown: validatedPost.breakdown,
          generatedManually: true,
        },
      });

      created.push(post);
      recentPostTexts.unshift(validatedPost.text);
      recentPostTexts = recentPostTexts.slice(0, 10);

      await monitor(
        topicId,
        topic.pageId,
        post._id,
        'MANUAL_POST_CREATED',
        `Angle: ${angle}, QA Score: ${validatedPost.score}, Scheduled: ${scheduled}`
      );
      angleIndex++;
    }
    if (angleIndex >= totalAngles) break;
  }

  await expireTopicIfComplete(topic);
  return { success: true, created };
}

// ========================================================================
//  GENERATE POSTS FOR TOPIC (wrapper)
// ========================================================================
async function generatePostsForTopic(topicId, options = {}) {
  const { immediate = false } = options;
  const topic = await AiTopic.findById(topicId);
  if (!topic) throw new Error('Topic not found');
  const result = await generatePostsForManualTopic(topicId, immediate);
  return result.created || [];
}

// ========================================================================
//  DELETE TOPIC POSTS
// ========================================================================
async function deleteTopicPosts(topicId) {
  await AiScheduledPost.deleteMany({ topicId });
  await monitor(null, null, null, 'TOPIC_POSTS_DELETED', `Topic ${topicId} posts deleted`);
}

// ========================================================================
//  CREATE AI LOG (simple wrapper for compatibility)
// ========================================================================
async function createAiLog(pageId, postId, action, message) {
  await monitor(null, pageId, postId, action, message);
}

// ========================================================================
//  GENERATE NEXT POST FOR A SINGLE TOPIC (called by autopilot)
// ========================================================================
async function generateNextPostForTopic(topic) {
  // --- Prerequisites ---
  const now = new Date();
  if (topic.endDate < now) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_EXPIRED', 'Topic has already ended.');
    return null;
  }

  const usedCount = await getUsedAnglesCount(topic._id);
  const totalAngles = topic.customAngles && topic.customAngles.length ? topic.customAngles.length : 5;
  if (usedCount >= totalAngles) {
    await expireTopicIfComplete(topic);
    return null;
  }

  const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
  if (pendingCount > 0) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_HAS_PENDING', `Topic has ${pendingCount} pending posts.`);
    return null;
  }

  const pagePending = await AiScheduledPost.countDocuments({ pageId: topic.pageId, status: 'PENDING' });
  if (pagePending >= MAX_SCHEDULED_POSTS) {
    await monitor(
      topic._id,
      topic.pageId,
      null,
      'SKIP_PAGE_LIMIT',
      `Page has ${pagePending} pending (max ${MAX_SCHEDULED_POSTS}).`
    );
    return null;
  }

  // Find a free time slot
  const existingPosts = await AiScheduledPost.find({ topicId: topic._id }).select('scheduledTime');
  const existingTimes = new Set(existingPosts.map((p) => p.scheduledTime.getTime()));
  const start = moment.tz(topic.startDate, TIMEZONE);
  const end = moment.tz(topic.endDate, TIMEZONE);
  const nowMoment = moment().tz(TIMEZONE);
  let scheduledTime = null;

  for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, 'day')) {
    for (let i = 0; i < topic.postsPerDay; i++) {
      const timeStr = topic.times[i % topic.times.length];
      const candidate = moment.tz(`${day.format('YYYY-MM-DD')} ${timeStr}`, TIMEZONE);
      if (candidate.isBefore(nowMoment)) continue;
      const key = candidate.toDate().getTime();
      if (!existingTimes.has(key)) {
        scheduledTime = candidate.toDate();
        break;
      }
    }
    if (scheduledTime) break;
  }
  if (!scheduledTime) {
    await monitor(topic._id, topic.pageId, null, 'SKIP_NO_SLOT', 'No future time slot available.');
    return null;
  }

  // --- Generate post ---
  const anglesToUse = topic.customAngles && topic.customAngles.length ? topic.customAngles : DEFAULT_ANGLES;
  const nextAngle = anglesToUse[usedCount];

  const pageProfile = await PageProfile.findOne({ pageId: topic.pageId });
  const recentPosts = await AiScheduledPost.find({ pageId: topic.pageId, status: 'PENDING' })
    .sort({ scheduledTime: -1 })
    .limit(10)
    .select('text')
    .lean();
  const recentPostTexts = recentPosts.map((p) => p.text).filter(Boolean);

  const context = await pageIntelligence.enrichContext(
    topic.pageId,
    pageProfile,
    topic.topicName,
    recentPostTexts
  );

  const validatedPost = await generateAndValidatePost(
    topic.topicName,
    nextAngle,
    topic.pageId,
    pageProfile,
    recentPostTexts,
    context.dna,
    context.topHeadline,
    context.contentType
  );
  if (!validatedPost) {
    await monitor(topic._id, topic.pageId, null, 'POST_GEN_FAILED', `Angle "${nextAngle}" failed QA.`);
    return null;
  }

  let rawMediaUrl = null;
  if (topic.includeMedia) rawMediaUrl = await generateImage(topic.topicName, topic.pageId, validatedPost.text);
  let finalMediaUrl = null;
  if (rawMediaUrl || topic.includeVideo) {
    finalMediaUrl = await createBrandedImage(topic._id, topic.pageId, rawMediaUrl, validatedPost.text);
  }

  const post = await AiScheduledPost.create({
    topicId: topic._id,
    pageId: topic.pageId,
    text: validatedPost.text,
    mediaUrl: finalMediaUrl,
    scheduledTime: scheduledTime,
    status: 'PENDING',
    meta: {
      angle: nextAngle,
      qaScore: validatedPost.score,
      qaBreakdown: validatedPost.breakdown,
      generatedByAutoCron: true,
    },
  });

  await monitor(
    topic._id,
    topic.pageId,
    post._id,
    'AUTO_POST_GENERATED',
    `Angle: "${nextAngle}" (${usedCount + 1}/${totalAngles}), Score: ${validatedPost.score}`
  );

  // Check if topic is now complete
  const newUsedCount = await getUsedAnglesCount(topic._id);
  if (newUsedCount >= totalAngles) {
    await expireTopicIfComplete(topic);
  }

  return post;
}

// ========================================================================
//  AUTOPILOT – ensure active topics and generate posts
// ========================================================================
async function ensureActiveTopicsForPage(pageId) {
  // --- CLEANUP: remove fully used topics with no pending posts ---
  const allTopics = await AiTopic.find({ pageId });
  for (const topic of allTopics) {
    const usedCount = await getUsedAnglesCount(topic._id);
    const totalAngles = topic.customAngles && topic.customAngles.length ? topic.customAngles.length : 5;
    if (usedCount >= totalAngles) {
      const pending = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
      if (pending === 0) {
        await AiTopic.findByIdAndDelete(topic._id);
        await AiLog.deleteMany({ topicId: topic._id });
        await monitor(
          null,
          pageId,
          null,
          'CLEANUP_DELETED',
          `Removed expired topic "${topic.topicName}" (no pending posts).`
        );
      }
    }
  }

  // --- Generate posts for active topics ---
  const now = new Date();
  const activeTopics = await AiTopic.find({
    pageId,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  for (const topic of activeTopics) {
    const pendingCount = await AiScheduledPost.countDocuments({ topicId: topic._id, status: 'PENDING' });
    if (pendingCount === 0) {
      try {
        await generateNextPostForTopic(topic);
      } catch (err) {
        console.error(`BLOCKED: ${err.message}`);
        await monitor(topic._id, topic.pageId, null, 'HARD_LIMIT_TRIGGERED', err.message);
        break; // stop generation for this cycle to avoid spam
      }
    }
  }

  // --- AUTO‑TOPIC CREATION (if allowed) ---
  const settings = await getGlobalSettings();
  if (!settings.autoTopicCreationEnabled) {
    await monitor(null, pageId, null, 'AUTO_SKIP_GLOBAL_DISABLED', 'Global auto‑topic creation is disabled.');
    return;
  }

  const autoTopics = activeTopics.filter((t) => !t.manualTopic);
  if (autoTopics.length >= MIN_ACTIVE_TOPICS) {
    await monitor(
      null,
      pageId,
      null,
      'AUTO_SKIP_MIN_MET',
      `Already have ${autoTopics.length} auto topics (min ${MIN_ACTIVE_TOPICS})`
    );
    return;
  }
  if (activeTopics.length >= settings.maxActiveTopics) {
    await monitor(
      null,
      pageId,
      null,
      'AUTO_SKIP_MAX_ACTIVE_TOPICS',
      `Already have ${activeTopics.length} active topics (max ${settings.maxActiveTopics})`
    );
    return;
  }

  const profile = await PageProfile.findOne({ pageId });
  if (!profile?.audienceInterest?.length) return;

  const interests = profile.audienceInterest;
  const selectedInterest = interests[Math.floor(Math.random() * interests.length)];

  let topicName = null;
  let engineScore = null;

  // ---- Use trending engine or fallback ----
  if (profile.useTrendingTopics) {
    try {
      const candidates = await discoverAndRank(selectedInterest);
      if (candidates && candidates.length > 0) {
        const best = candidates[0];
        topicName = best.title;
        engineScore = best.overallScore;
        if (topicName.length > 80) topicName = topicName.slice(0, 77) + '…';
        await monitor(
          null,
          pageId,
          null,
          'ENGINE_FETCH_SUCCESS',
          `Interest: "${selectedInterest}" → Topic: "${topicName}" (Score: ${engineScore})`
        );
      } else {
        await monitor(null, pageId, null, 'ENGINE_FETCH_EMPTY', `No candidates for interest "${selectedInterest}"`);
      }
    } catch (err) {
      console.warn(`Engine discovery failed for interest "${selectedInterest}":`, err.message);
      await monitor(null, pageId, null, 'ENGINE_FETCH_ERROR', err.message);
    }

    // Fallback to news API if engine gave nothing
    if (!topicName) {
      let trendingHeadline = null;
      try {
        trendingHeadline = await fetchTrendingHeadline(pageId, selectedInterest);
      } catch (e) {
        console.warn('Trending headline fetch failed, proceeding without news:', e.message);
      }
      topicName = await generateShortTopicName(selectedInterest, trendingHeadline, pageId);
      if (!topicName) topicName = `Latest update on ${selectedInterest}`;
      await monitor(
        null,
        pageId,
        null,
        'FALLBACK_TOPIC_GENERATED',
        `Used fallback for interest "${selectedInterest}" → Topic: "${topicName}"`
      );
    }
  } else {
    // ---- Trending mode OFF: generate generic topic from interest ----
    topicName = await generateShortTopicName(selectedInterest, null, pageId);
    if (!topicName) topicName = `Latest update on ${selectedInterest}`;
    await monitor(
      null,
      pageId,
      null,
      'TOPIC_GENERATED_FROM_INTEREST_ONLY',
      `Interest: "${selectedInterest}" → Topic: "${topicName}"`
    );
  }

  // ---- Quality checks ----
  const { topicScore, pageFit } = await evaluateTopicQuality(topicName, pageId);
  let overallQuality = (topicScore + pageFit) / 2;
  if (engineScore !== null && engineScore !== undefined) {
    overallQuality = (overallQuality + engineScore) / 2; // average of three
  }

  if (overallQuality < 35) {
    await monitor(
      null,
      pageId,
      null,
      'AUTO_TOPIC_REJECTED_QUALITY',
      `Topic "${topicName}" overall quality ${overallQuality.toFixed(1)} (engine=${engineScore || 'N/A'}, topic=${topicScore}, fit=${pageFit})`
    );
    return;
  }

  // ---- Similarity check ----
  if (await isTopicTooSimilar(topicName, pageId)) {
    topicName = `${topicName} (fresh take)`;
    await monitor(null, pageId, null, 'TOPIC_SIMILAR_RENAMED', `Renamed to "${topicName}"`);
  }

  // ---- Create topic ----
  const startDate = await getIntelligentStartDate(pageId);
  const endDate = moment.tz(startDate, TIMEZONE).add(TOPIC_LIFETIME_DAYS, 'days').toDate();
  const times = [];
  for (let i = 0; i < POSTS_PER_DAY_AUTO; i++) {
    const time = await getNonCollidingTime(pageId, startDate);
    times.push(time);
  }

  const customAngles = await generateCustomAngles(topicName, pageId, selectedInterest);

  const newTopic = await AiTopic.create({
    topicName,
    pageId,
    startDate,
    endDate,
    times,
    postsPerDay: POSTS_PER_DAY_AUTO,
    includeMedia: INCLUDE_MEDIA_AUTO,
    includeVideo: false,
    customAngles,
    manualTopic: false,
    meta: {
      sourceInterest: selectedInterest,
      engineScore: engineScore,
      topicScore: topicScore,
      pageFit: pageFit,
      overallQuality: overallQuality,
      generatedBy: profile.useTrendingTopics ? 'engine_with_fallback' : 'interest_only',
    },
  });

  await monitor(
    newTopic._id,
    pageId,
    null,
    'AUTO_TOPIC_CREATED',
    `Topic: "${topicName}", Interest: "${selectedInterest}", Angles: ${customAngles.join(', ')}, Scores: engine=${engineScore || 'N/A'}, topic=${topicScore}, fit=${pageFit}`
  );

  // Generate first post for the new topic
  try {
    await generateNextPostForTopic(newTopic);
  } catch (err) {
    console.error(`Failed to generate first post for new topic: ${err.message}`);
    await monitor(newTopic._id, pageId, null, 'AUTO_FIRST_POST_FAILED', err.message);
  }
}

// ========================================================================
//  EXPORTS
// ========================================================================
module.exports = {
  createManualTopicWithQA,
  generatePostsForManualTopic,
  generatePostsForTopic,
  deleteTopicPosts,
  createAiLog,
  generateNextPostForTopic,
  ensureActiveTopicsForPage,
};
