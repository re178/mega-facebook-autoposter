// services/topicEngine/builder.js
const { generateSmart } = require('../textProviders');

// ==================== LOGGER ====================
function buildLog(action, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BUILDER:${action}] ${message}`);
  if (data) console.log('  └─', JSON.stringify(data, null, 2).slice(0, 500));
}

// ==================== PROMPT BUILDER ====================
function buildPrompt(idea, interest, format) {
  const { title, description, source, category, overallScore } = idea;

  let formatRules = '';
  let lengthConstraint = '';

  if (format === 'topic') {
    formatRules = `
- Output MUST be a SINGLE SHORT TOPIC PHRASE (5-10 words).
- No sentences. Just the headline.
- No emojis, no hashtags.
- Example: "NASA Confirms Ancient Water on Mars"`;
    lengthConstraint = 'Maximum 10 words.';
  } 
  else if (format === 'blogpost') {
    formatRules = `
- Output MUST be a FULL BLOGPOST (800-1200 words).
- Structure: 
  - Catchy Introduction (hook the reader)
  - 3 to 5 Key Sections with subheadings (use **bold** for subheadings)
  - Conclusion (summarize and give a thought-provoking ending)
- Be authoritative, detailed, and well-structured.
- Do NOT use markdown (except bold), hashtags, or emojis.`;
    lengthConstraint = 'Minimum 800 words, maximum 1200 words.';
  } 
  else { // format === 'social'
    formatRules = `
- Output MUST be a SHORT SOCIAL MEDIA POST (max 2 sentences).
- First sentence: bold fact, alert, or strong opinion.
- Second sentence (optional): call-to-action or question.
- Punchy, conversational, and engaging.
- No hashtags unless they fit naturally.`;
    lengthConstraint = 'Maximum 2 sentences.';
  }

  return `
YOU ARE A CONTENT WRITER. FOLLOW THESE RULES EXACTLY.

FORMAT REQUESTED: ${format.toUpperCase()}
${formatRules}
${lengthConstraint}

TOPIC INTEREST: "${interest}"
SOURCE OF IDEA: ${source} (Authority Score: ${overallScore}/100)

THE DISCOVERED IDEA:
- Title: ${title}
- Summary: ${description}
- Category: ${category}

INSTRUCTIONS:
1. Write strictly about the idea above. Do NOT change the core fact.
2. Do NOT mention unrelated topics.
3. Do NOT use phrases like "Did you know", "Have you ever", "Let's explore".
4. Do NOT add meta-commentary like "Here is your post" or "I've written this for you".
5. Return ONLY the final content with no extra quotes, explanations, or markdown.
`;
}

// ==================== GENERATE FINAL OUTPUT ====================
async function buildOutput(rankedIdea, interest, format) {
  buildLog('START', `Building ${format} for interest: "${interest}" using idea: "${rankedIdea.title}"`);

  if (!rankedIdea) {
    buildLog('ERROR', 'No ranked idea provided');
    return { success: false, content: null, error: 'No ranked idea provided.' };
  }

  try {
    const prompt = buildPrompt(rankedIdea, interest, format);
    buildLog('PROMPT', `Prompt built (${prompt.length} chars)`);

    // Call the AI provider using your existing generateSmart
    let generatedText = await generateSmart(prompt);

    if (!generatedText) {
      buildLog('FALLBACK', 'AI returned empty, falling back to raw title/description');
      if (format === 'topic') {
        generatedText = rankedIdea.title;
      } else {
        generatedText = rankedIdea.description || rankedIdea.title;
      }
    }

    // Clean up: remove leading/trailing quotes and extra whitespace
    generatedText = generatedText.replace(/^["']|["']$/g, '').trim();
    
    // If it's a topic, ensure it's short
    if (format === 'topic') {
      const words = generatedText.split(/\s+/);
      if (words.length > 10) {
        generatedText = words.slice(0, 10).join(' ');
      }
    }

    buildLog('SUCCESS', `Generated ${format} (${generatedText.length} chars)`);
    return {
      success: true,
      content: generatedText,
      source: rankedIdea.source,
      score: rankedIdea.overallScore,
      format: format,
      interest: interest,
      wordCount: generatedText.split(/\s+/).length,
    };
  } catch (error) {
    buildLog('ERROR', `Failed: ${error.message}`);
    return { success: false, content: null, error: error.message };
  }
}

module.exports = { buildOutput };
