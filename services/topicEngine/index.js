// services/topicEngine/index.js
const { discoverAndRank } = require('./engine');
const { buildOutput } = require('./builder');

// ==================== LOGGER ====================
function mainLog(action, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [TOPIC_ENGINE:${action}] ${message}`);
  if (data) console.log('  └─', JSON.stringify(data, null, 2).slice(0, 500));
}

/**
 * MAIN ENTRY POINT - Generate content based on Interest and Format.
 * 
 * @param {string} interest - The topic interest (e.g., 'Science', 'Football').
 * @param {string} format - 'topic', 'blogpost', or 'social'.
 * @param {string} pageId - Optional: for logging (defaults to 'SYSTEM').
 * @returns {Promise<Object>} - { success, content, source, score, format, interest }
 */
async function generateContent({ interest, format = 'social', pageId = 'SYSTEM' }) {
  mainLog('REQUEST', `Received: interest="${interest}", format="${format}"`);

  if (!interest) {
    mainLog('ERROR', 'Missing "interest" parameter');
    return { success: false, content: null, error: 'Interest is required.' };
  }

  if (!['topic', 'blogpost', 'social'].includes(format)) {
    mainLog('ERROR', `Invalid format: "${format}"`);
    return { success: false, content: null, error: 'Format must be "topic", "blogpost", or "social".' };
  }

  try {
    // 1. Run the full discovery pipeline (ALL IN MEMORY)
    mainLog('PHASE_1', 'Starting discovery pipeline...');
    const rankedCandidates = await discoverAndRank(interest);

    if (!rankedCandidates || rankedCandidates.length === 0) {
      mainLog('WARNING', `No candidates found for interest: "${interest}"`);
      return { 
        success: false, 
        content: null, 
        error: `No content discovered for interest: "${interest}". Try a different interest.` 
      };
    }

    // 2. Take the best ranked candidate
    const bestIdea = rankedCandidates[0];
    mainLog('PHASE_2', `Best candidate: "${bestIdea.title}" (Score: ${bestIdea.overallScore})`);

    // 3. Build the final output in the requested format
    mainLog('PHASE_3', `Building ${format}...`);
    const result = await buildOutput(bestIdea, interest, format);

    if (result.success) {
      mainLog('RESPONSE', `✅ Returning ${format} (${result.wordCount || 'unknown'} words) from source: ${result.source}`);
    } else {
      mainLog('RESPONSE', `❌ Build failed: ${result.error}`);
    }

    return result;
  } catch (error) {
    mainLog('CRASH', `Unexpected error: ${error.message}`);
    return { success: false, content: null, error: error.message };
  }
}

module.exports = { generateContent };
