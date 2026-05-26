/* =========================================================
   6️⃣ Cloudflare (Smart: detects if scene plan or short post)
========================================================= */

class CloudflareText {
  static get name() { return 'Cloudflare'; }
  static get dailyLimit() { return 500; }

  static async generate(prompt) {
    // Detect if this is a scene plan request (contains "JSON scene plan" or similar)
    const isScenePlan = prompt.includes('JSON scene plan') || 
                        prompt.includes('scene plan') ||
                        prompt.includes('Return only JSON') ||
                        prompt.includes('"scenes":');

    const maxTokens = isScenePlan ? 800 : 200;
    const temperature = isScenePlan ? 0.3 : 0.7;
    
    let systemContent = isScenePlan 
      ? 'You are a JSON generator. Output ONLY valid JSON, no markdown, no explanation, no extra text. Follow the user\'s request exactly.'
      : `You generate Facebook posts.

Strictly follow all formatting rules in the user prompt.
Never add emojis.
Never add hashtags.
Never use bullet points or lists.
Never explain anything.
Return only the final post text.`;

    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: temperature
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return safeText(res.data?.result?.response);
  }
}
