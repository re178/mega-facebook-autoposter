const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function detectCritical(topic) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'You analyze urgency only.'
      },
      {
        role: 'user',
        content: `
Is there a very recent serious or breaking event related to "${topic}" 
that likely occurred within the last 48 hours
Answer only YES or NO
`
      }
    ],
    max_tokens: 3
  });

  return response.choices[0].message.content.trim() === 'YES';
}

module.exports = { detectCritical };
