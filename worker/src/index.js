const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Per-tone style instructions (used for blending when multiple tones are selected)
const TONE_INSTRUCTIONS = {
  professional: `Write formally and courteously. Use clear, polished language. Avoid contractions. Be solution-oriented.`,
  empathetic:   `Lead with genuine understanding. Acknowledge the customer's frustration or concern before moving to solutions. Use warm, human language that shows you care.`,
  direct:       `Be concise and get straight to the point. Skip pleasantries. State the solution clearly. Use short sentences.`,
  friendly:     `Use a warm, conversational tone. Feel free to use contractions. Be approachable and positive while still being helpful.`,
  apologetic:   `Open with a sincere, specific apology that takes clear ownership — use first-person accountability ("we got this wrong", "I'm sorry we let you down"). Move to the resolution only after the apology has landed. Keep it genuine, not performative.`,
  reassuring:   `Lead with calm confidence that the issue will be resolved. Use certain, steady language ("You're in good hands", "We'll take care of this"). Avoid phrases that introduce doubt. End with a clear, confident next step.`,
  technical:    `Be precise and direct. Do not over-explain basics. Use numbered steps for any procedure. Include exact values, settings, or commands where relevant. Skip emotional language. Trust the customer to follow technical instructions.`,
  firm:         `State your position clearly in the first sentence — do not bury it. Be polite throughout but do not hedge or imply flexibility that does not exist. Offer any genuine alternatives available. Do not apologize for the policy itself.`,
};

function buildTonePrompt(tones) {
  const valid = (Array.isArray(tones) ? tones : [tones]).filter(t => TONE_INSTRUCTIONS[t]);
  if (valid.length === 0) valid.push('professional');
  if (valid.length === 1) {
    const t = valid[0];
    return `You are a customer support agent. ${TONE_INSTRUCTIONS[t]}`;
  }
  const label = t => t.charAt(0).toUpperCase() + t.slice(1);
  const lines = valid.map(t => `- ${label(t)}: ${TONE_INSTRUCTIONS[t]}`).join('\n');
  return `You are a customer support agent. Blend the following tone styles in your response:\n${lines}`;
}

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/* ── System prompt builder ───────────────────────────────── */

function buildSystemPrompt({ mode, tones, agentName, instructions, traits, knowledgeContext }) {
  let system;

  if (mode === 'ask') {
    // Internal Q&A mode — strict source-grounded answers
    system = agentName
      ? `You are ${agentName}'s internal knowledge assistant for customer support agents.`
      : `You are an internal knowledge assistant for a customer support team.`;

    system += `

Your job is to answer questions about products, processes, policies, and procedures.

STRICT RULES:
- Base your answer ONLY on the Knowledge Base provided below.
- If the exact information is in the Knowledge Base, reproduce the relevant steps or details accurately and completely — do not paraphrase loosely or omit steps.
- If the information is NOT in the Knowledge Base, say clearly: "I don't have information about that in the current sources." Do not guess or use general knowledge.
- Use numbered steps for any procedure. Use bullet points for lists of options or features.
- Do not add warnings, caveats, or suggestions not present in the sources.
- This is for the agent's own reference — be direct and precise, not customer-facing.`;

    if (instructions?.trim()) {
      system += `\n\n## Company Context\n${instructions.trim()}`;
    }

    if (knowledgeContext?.trim()) {
      system += `\n\n## Knowledge Base\n${knowledgeContext.trim().slice(0, 20000)}`;
    } else {
      system += `\n\n(No knowledge sources connected. Go to Sources tab to add your documentation.)`;
    }

    return system;
  }

  // Default: customer reply mode
  const tonePrompt = buildTonePrompt(tones);

  system = agentName
    ? `You are ${agentName}, a customer support agent. ${tonePrompt}`
    : tonePrompt;

  system += `\n\nYou help customer support agents draft responses to customer concerns.
Given a customer concern, write a suggested reply the agent can use or adapt.
Write only the response text — no subject lines, no labels, no preamble like "Here is a response:".
Keep it concise and focused.`;

  if (instructions?.trim()) {
    system += `\n\n## Company Context & Instructions\n${instructions.trim()}`;
  }

  if (traits) {
    const { empathy = 60, formality = 60, length = 50 } = traits;
    const empStr  = empathy  > 70 ? 'high — acknowledge feelings before solutions'
                  : empathy  < 30 ? 'low — stay task-focused and skip emotional language'
                  : 'moderate';
    const fmlStr  = formality > 70 ? 'formal — no contractions, use professional titles'
                  : formality < 30 ? 'casual — contractions fine, conversational register'
                  : 'balanced';
    const lenStr  = length   > 70 ? 'thorough — include context, next steps, and a warm close'
                  : length   < 30 ? 'brief — one or two sentences maximum'
                  : 'concise but complete';
    system += `\n\n## Style Guidelines\nEmpathy: ${empStr}. Formality: ${fmlStr}. Length: ${lenStr}.`;
  }

  if (knowledgeContext?.trim()) {
    system += `\n\n## Knowledge Base — Authoritative Source\nThe information below is from your company's official documentation. Use it as the primary source of truth for any product details, steps, or policies in your response. Reproduce steps accurately — do not paraphrase in a way that loses precision.\n\n${knowledgeContext.trim().slice(0, 20000)}`;
  }

  return system;
}

/* ── /suggest ────────────────────────────────────────────── */

async function handleSuggest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
  }

  const {
    concern,
    mode = 'reply',
    tones = ['professional'],
    agentName,
    instructions,
    traits,
    examples = [],
    knowledgeContext,
  } = body;

  if (!concern || typeof concern !== 'string' || !concern.trim()) {
    return corsResponse(JSON.stringify({ error: 'concern is required' }), 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
  }

  const system = buildSystemPrompt({ mode, tones, agentName, instructions, traits, knowledgeContext });

  // Build messages — inject few-shot examples before the real concern (reply mode only)
  const messages = [];
  if (mode !== 'ask') {
    for (const ex of examples.slice(0, 5)) {
      if (ex.concern?.trim() && ex.response?.trim()) {
        messages.push({ role: 'user',      content: ex.concern.trim() });
        messages.push({ role: 'assistant', content: ex.response.trim() });
      }
    }
  }
  messages.push({ role: 'user', content: concern.trim() });

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: mode === 'ask' ? 2048 : 1024,
      system,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return corsResponse(JSON.stringify({ error: 'Claude API error', detail: err }), 502);
  }

  const data = await anthropicRes.json();
  const suggestion = data.content?.[0]?.text ?? '';
  return corsResponse(JSON.stringify({ suggestion }));
}

/* ── /fetch-source ───────────────────────────────────────── */

function extractNotionPageId(url) {
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuid = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuid) return uuid[1].replace(/-/g, '');
  // 32-char hex (no dashes)
  const hex = url.match(/([a-f0-9]{32})(?:[^a-f0-9]|$)/i);
  if (hex) return hex[1];
  // Last URL segment after final '-'
  const seg = url.replace(/\?.*/, '').split('/').pop();
  const id  = seg.split('-').pop();
  if (id && id.length >= 32) return id.slice(0, 32);
  return null;
}

function extractNotionTitle(pageData) {
  const props = pageData.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === 'title' && prop.title?.length) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return 'Notion Page';
}

function extractNotionText(blocksData) {
  const lines = [];
  for (const block of (blocksData.results || [])) {
    const type    = block.type;
    const content = block[type];
    if (!content) continue;
    const rich = content.rich_text || [];
    const text = rich.map(t => t.plain_text).join('');
    if (!text.trim()) continue;
    if      (type === 'heading_1')           lines.push(`# ${text}`);
    else if (type === 'heading_2')           lines.push(`## ${text}`);
    else if (type === 'heading_3')           lines.push(`### ${text}`);
    else if (type === 'bulleted_list_item')  lines.push(`• ${text}`);
    else if (type === 'numbered_list_item')  lines.push(`${text}`);
    else if (type === 'code')                lines.push(`\`${text}\``);
    else if (type === 'quote')               lines.push(`> ${text}`);
    else                                     lines.push(text);
  }
  return lines.join('\n');
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleFetchSource(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
  }

  const { type, url: sourceUrl, token } = body;

  /* ── URL fetch ── */
  if (type === 'url') {
    if (!sourceUrl) return corsResponse(JSON.stringify({ error: 'url is required' }), 400);
    try {
      const res = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Beacon/1.0; +https://github.com/kevingarma-star/beacon)' },
        redirect: 'follow',
      });
      const ct   = res.headers.get('content-type') || '';
      const raw  = await res.text();
      const text = ct.includes('text/plain') || ct.includes('application/json')
        ? raw
        : stripHtml(raw);
      return corsResponse(JSON.stringify({ content: text.slice(0, 30000) }));
    } catch (err) {
      return corsResponse(JSON.stringify({ error: `Could not fetch URL: ${err.message}` }), 502);
    }
  }

  /* ── Notion fetch ── */
  if (type === 'notion') {
    const notionToken = token || env.NOTION_TOKEN;
    if (!notionToken) {
      return corsResponse(JSON.stringify({ error: 'Notion integration token required. Add it in the source setup.' }), 400);
    }
    if (!sourceUrl) return corsResponse(JSON.stringify({ error: 'Notion page URL is required' }), 400);

    const pageId = extractNotionPageId(sourceUrl);
    if (!pageId) {
      return corsResponse(JSON.stringify({ error: 'Could not extract a Notion page ID from that URL. Make sure you share the page link directly.' }), 400);
    }

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    try {
      const [pageRes, blocksRes] = await Promise.all([
        fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers }),
        fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, { headers }),
      ]);

      if (!pageRes.ok) {
        const err = await pageRes.json();
        return corsResponse(JSON.stringify({ error: err.message || 'Notion API error — check your token and that the page is shared with your integration.' }), 502);
      }

      const [pageData, blocksData] = await Promise.all([pageRes.json(), blocksRes.json()]);
      const title   = extractNotionTitle(pageData);
      const content = extractNotionText(blocksData);

      return corsResponse(JSON.stringify({ title, content: content.slice(0, 30000) }));
    } catch (err) {
      return corsResponse(JSON.stringify({ error: `Notion fetch failed: ${err.message}` }), 502);
    }
  }

  return corsResponse(JSON.stringify({ error: `Unknown source type: ${type}` }), 400);
}

/* ── Router ──────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/health' && request.method === 'GET') {
      return corsResponse(JSON.stringify({ ok: true }));
    }

    if (pathname === '/suggest' && request.method === 'POST') {
      return handleSuggest(request, env);
    }

    if (pathname === '/fetch-source' && request.method === 'POST') {
      return handleFetchSource(request, env);
    }

    return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
  },
};
