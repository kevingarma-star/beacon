const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TONE_PROMPTS = {
  professional: `You are a professional customer support agent. Write formally and courteously.
Use clear, polished language. Avoid contractions. Be solution-oriented.`,

  empathetic: `You are an empathetic customer support agent. Lead with genuine understanding.
Acknowledge the customer's frustration or concern before moving to solutions.
Use warm, human language that shows you care.`,

  direct: `You are a direct customer support agent. Be concise and get straight to the point.
Skip pleasantries. State the solution clearly. Use short sentences.`,

  friendly: `You are a friendly customer support agent. Use a warm, conversational tone.
Feel free to use contractions. Be approachable and positive while still being helpful.`,
};

const SYSTEM_BASE = `You help customer support agents draft responses to customer concerns.
Given a customer concern, write a suggested reply the agent can use or adapt.
Write only the response text — no subject lines, no labels, no preamble like "Here is a response:".
Keep it concise and focused.`;

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return corsResponse(JSON.stringify({ ok: true }));
    }

    if (url.pathname !== '/suggest' || request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    }

    let concern, tone;
    try {
      ({ concern, tone = 'professional' } = await request.json());
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
    }

    if (!concern || typeof concern !== 'string' || concern.trim().length === 0) {
      return corsResponse(JSON.stringify({ error: 'concern is required' }), 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
    }

    const tonePrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.professional;
    const systemPrompt = `${tonePrompt}\n\n${SYSTEM_BASE}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: concern.trim() }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return corsResponse(JSON.stringify({ error: 'Claude API error', detail: err }), 502);
    }

    const data = await anthropicRes.json();
    const suggestion = data.content?.[0]?.text ?? '';

    return corsResponse(JSON.stringify({ suggestion }));
  },
};
