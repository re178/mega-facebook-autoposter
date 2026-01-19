const OpenAI = require('openai');
const AiScheduledPost = require('../models/AiScheduledPost');
const Page = require('../models/Page');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/*
CONTENT RULES ENGINE
*/
const ANGLES = [
  'memory',
  'observation',
  'curiosity',
  'experience',
  'reflection',
  'surprise',
  'casual'
];

function cleanText(text) {
  return text
    .replace(/[-_•:*#"`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildPrompt({ topic, angle, isTrending, isCritical }) {
  let base = '';

  if (isCritical) {
    base =
      `Write a calm factual Facebook post about a very recent event related to ${topic}. 
       No opinions. No advice. No excitement. Just clear human wording.`;
  } else if (isTrending) {
    base =
      `Write a natural Facebook post reacting to something people are currently talking about related to ${topic}. 
       Sound like a normal person noticing it.`;
  } else {
    switch (angle) {
      case 'memory':
        base = `Write a Facebook post recalling a memory related to ${topic}.`;
        break;
      case 'observation':
        base = `Write a Facebook post sharing an everyday observation about ${topic}.`;
        break;
      case 'curiosity':
        base = `Write a Facebook post expressing curiosity about ${topic} in a natural way.`;
        break;
      case 'experience':
        base = `Write a Facebook post describing a personal experience related to ${topic}.`;
        break;
      case 'reflection':
        base = `Write a Facebook post reflecting quietly on ${topic}.`;
        break;
      case 'surprise':
        base = `Write a Facebook post reacting with mild surprise about ${topic}.`;
        break;
      default:
        base = `Write a casual Facebook post about ${topic}.`;
    }
  }

  return `
${base}
Rules
Write like a human
No advice
No teaching
No lists
No emojis
No symbols
No promotional tone
No AI language
`;
}

/*
CORE GENERATOR
*/
async function generateAiPosts({
  pageId,
  topic,
  postsPerDay,
  times,
  startDate,
  endDate,
  includeMedia,
  repeatType,
  isTrending = false,
  isCritical = false
}) {
  const posts = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let angleIndex = 0;

  for (let day = new Date(start); day <= end; ) {
    for (let i = 0; i < postsPerDay; i++) {
      const angle = ANGLES[angleIndex % ANGLES.length];
      angleIndex++;

      const textResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        temperature: 0.95,
        messages: [
          {
            role: 'system',
            content:
              'You write Facebook posts that sound fully human and natural.'
          },
          {
            role: 'user',
            content: buildPrompt({
              topic,
              angle,
              isTrending,
              isCritical
            })
          }
        ],
        max_tokens: 180
      });

      const text = cleanText(
        textResponse.choices[0].message.content
      );

      let mediaUrl = null;

      if (!isCritical && includeMedia && Math.random() > 0.4) {
        const image = await openai.images.generate({
          model: 'gpt-image-1',
          prompt:
            `A realistic everyday photo related to ${topic}. No text. Natural lighting.`,
          size: '1024x1024'
        });

        mediaUrl = image.data[0].url;
      }

      const [h, m] = times[i].split(':');
      const scheduledTime = new Date(day);
      scheduledTime.setHours(Number(h), Number(m), 0, 0);

      const post = await AiScheduledPost.create({
        pageId,
        topic,
        text,
        mediaUrl,
        scheduledTime,
        status: 'PENDING',
        retryCount: 0,
        meta: {
          angle,
          trending: isTrending,
          critical: isCritical
        }
      });

      posts.push(post);
    }

    if (repeatType === 'weekly') {
      day.setDate(day.getDate() + 7);
    } else if (repeatType === 'monthly') {
      day.setMonth(day.getMonth() + 1);
    } else {
      day.setDate(day.getDate() + 1);
    }
  }

  return posts;
}

module.exports = {
  generateAiPosts
};

