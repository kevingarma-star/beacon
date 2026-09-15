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
    system += `\n\n## Help Center & Knowledge Reference\nThe following articles and sources may be relevant to the customer's concern. Reference this information in your reply if it applies — use it to give accurate answers about products, policies, or processes. Write in your own voice; do not copy-paste.\n\n${knowledgeContext.trim().slice(0, 12000)}`;
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
    notionToken,
    intercomToken,
    slackToken,
  } = body;

  if (!concern || typeof concern !== 'string' || !concern.trim()) {
    return corsResponse(JSON.stringify({ error: 'concern is required' }), 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
  }

  // Search live workspaces and prepend results to any manual sources (all modes)
  let combinedContext = knowledgeContext || '';
  if (notionToken || intercomToken || slackToken) {
    const [notionCtx, intercomCtx, slackCtx] = await Promise.all([
      notionToken   ? searchNotionContext(concern.trim(), notionToken)     : Promise.resolve(''),
      intercomToken ? fetchIntercomContext(concern.trim(), intercomToken)  : Promise.resolve(''),
      slackToken    ? searchSlackContext(concern.trim(), slackToken)       : Promise.resolve(''),
    ]);

    const liveCtx = [notionCtx, intercomCtx, slackCtx].filter(Boolean).join('\n\n---\n\n');
    combinedContext = liveCtx
      ? liveCtx + (combinedContext ? '\n\n---\n\n' + combinedContext : '')
      : combinedContext;
  }

  const system = buildSystemPrompt({ mode, tones, agentName, instructions, traits, knowledgeContext: combinedContext });

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

/* ── /chat ───────────────────────────────────────────────── */

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
  }

  const {
    messages = [], tones = ['professional'], agentName, instructions, traits,
    knowledgeContext, notionToken, intercomToken, slackToken,
  } = body;

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return corsResponse(JSON.stringify({ error: 'messages must end with a user turn' }), 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
  }

  // Search live workspaces based on the latest user message
  let combinedContext = knowledgeContext || '';
  if (notionToken || intercomToken || slackToken) {
    const latestQuery = messages[messages.length - 1].content;
    const [notionCtx, intercomCtx, slackCtx] = await Promise.all([
      notionToken   ? searchNotionContext(latestQuery, notionToken)    : Promise.resolve(''),
      intercomToken ? fetchIntercomContext(latestQuery, intercomToken) : Promise.resolve(''),
      slackToken    ? searchSlackContext(latestQuery, slackToken)      : Promise.resolve(''),
    ]);
    const liveCtx = [notionCtx, intercomCtx, slackCtx].filter(Boolean).join('\n\n---\n\n');
    combinedContext = liveCtx
      ? liveCtx + (combinedContext ? '\n\n---\n\n' + combinedContext : '')
      : combinedContext;
  }

  const tonePrompt = buildTonePrompt(tones);

  let system = agentName
    ? `You are helping ${agentName}'s customer support team craft replies to customers.`
    : `You are helping a customer support agent craft replies to customers.`;

  system += `\n\n${tonePrompt}`;

  system += `\n\nWhen the agent shares a customer message or concern, draft a reply they can send directly to the customer. When they ask for changes (shorter, more empathetic, add an apology, etc.), revise and return the updated reply. Keep your response focused — include the draft clearly. Write the reply from the agent's perspective addressed to the customer.`;

  if (instructions?.trim()) {
    system += `\n\n## Company Context\n${instructions.trim()}`;
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

  if (combinedContext?.trim()) {
    system += `\n\n## Help Center & Knowledge Reference\nThe following articles and sources may be relevant. Reference them in your draft reply if they apply:\n\n${combinedContext.trim().slice(0, 12000)}`;
  }

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
      system,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return corsResponse(JSON.stringify({ error: 'Claude API error', detail: err }), 502);
  }

  const data = await anthropicRes.json();
  const message = data.content?.[0]?.text ?? '';
  return corsResponse(JSON.stringify({ message }));
}

/* ── Live workspace search helpers ──────────────────────── */

async function searchNotionContext(query, token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // Run page search + database discovery in parallel
  const [pageResult, dbResult] = await Promise.allSettled([
    fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        filter: { value: 'page', property: 'object' },
        page_size: 6,
      }),
    }).then(r => r.ok ? r.json() : null),

    fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        page_size: 10,
      }),
    }).then(r => r.ok ? r.json() : null),
  ]);

  const pageResults  = pageResult.status  === 'fulfilled' && pageResult.value  ? pageResult.value.results  || [] : [];
  const databases    = dbResult.status    === 'fulfilled' && dbResult.value    ? (dbResult.value.results   || []).slice(0, 5) : [];

  // Database fallback: query each accessible DB for relevant rows.
  // Primary: rows whose title keyword-matches the query.
  // Fallback: if no title match, include the 2 most recently edited rows so structured
  // databases (e.g. tracker tables) still surface their content even when row titles
  // don't contain the query terms.
  const existingIds = new Set(pageResults.map(p => p.id));
  const words       = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let dbPages = [];

  if (databases.length > 0) {
    const buckets = await Promise.all(databases.map(async db => {
      try {
        const r = await fetch(`https://api.notion.com/v1/databases/${db.id}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            page_size: 20,
            sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
          }),
        });
        if (!r.ok) return [];
        const { results = [] } = await r.json();
        const scored = results
          .filter(p => !existingIds.has(p.id))
          .map(p => {
            const title = extractNotionTitle(p).toLowerCase();
            const score = words.reduce((n, w) => n + (title.includes(w) ? 1 : 0), 0);
            return { ...p, _score: score };
          });

        const matched = scored.filter(p => p._score > 0).sort((a, b) => b._score - a._score).slice(0, 2);
        // No title match? Fall back to 2 most recently edited rows so structured
        // databases (tracker logs, etc.) still contribute their row content.
        return matched.length > 0 ? matched : scored.slice(0, 2);
      } catch {
        return [];
      }
    }));
    dbPages = buckets.flat();
  }

  // Merge: page search first, then DB matches that weren't already found; cap at 6 total
  const pages    = [...pageResults, ...dbPages].slice(0, 6);
  const sections = [];
  for (const page of pages) {
    try {
      const title  = extractNotionTitle(page);
      const props  = extractNotionProperties(page);          // database column values
      const blocks = await extractNotionContent(page.id, headers, 0, { n: 0 }, new Set([page.id]));
      const body   = [props, blocks].filter(Boolean).join('\n\n');
      if (body.trim()) {
        sections.push(`### ${title}\n${body.slice(0, 6000)}`);
      }
    } catch {
      // skip pages that fail
    }
  }

  return sections.join('\n\n---\n\n');
}

async function fetchIntercomContext(query, token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Intercom-Version': '2.13',
  };

  let articles = [];

  // Primary: Intercom's native search API — uses their relevance ranking, far more accurate
  // than fetching a flat list and doing keyword counting ourselves
  try {
    const searchRes = await fetch(
      `https://api.intercom.io/articles/search?phrase=${encodeURIComponent(query)}&state=published&per_page=10`,
      { headers }
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      articles = (data.data || []).filter(a => !a.state || a.state === 'published');
    }
  } catch {
    // fall through to list fallback
  }

  // Fallback: paginated list + keyword scoring (covers API plan differences)
  if (!articles.length) {
    try {
      const [p1, p2] = await Promise.all([
        fetch('https://api.intercom.io/articles?per_page=50&page=1', { headers }).then(r => r.ok ? r.json() : {}),
        fetch('https://api.intercom.io/articles?per_page=50&page=2', { headers }).then(r => r.ok ? r.json() : {}),
      ]);
      const all = [...(p1.data || []), ...(p2.data || [])].filter(a => a.state === 'published');

      if (all.length) {
        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        function score(a) {
          const text = `${a.title} ${stripHtml(a.body || '')}`.toLowerCase();
          return words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
        }
        articles = all.map(a => ({ ...a, _score: score(a) })).sort((a, b) => b._score - a._score);
      }
    } catch {
      return '';
    }
  }

  if (!articles.length) return '';

  return articles
    .slice(0, 8)
    .map(a => `### ${a.title}\n${stripHtml(a.body || '').slice(0, 4000)}`)
    .join('\n\n---\n\n');
}

async function searchSlackContext(query, token) {
  const headers = { 'Authorization': `Bearer ${token}` };

  // Try search.messages first — only works with user tokens (xoxp-*) + search:read scope.
  // Bot tokens (xoxb-*) will get ok:false here, so we fall through to the history fallback.
  try {
    const res = await fetch(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=6&highlight=false`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        const matches = data.messages?.matches ?? [];
        if (matches.length) {
          const snippets = matches.map(m => {
            const channel = m.channel?.name ? `#${m.channel.name}` : 'Slack';
            const user    = m.username || m.user || 'Unknown';
            const text    = (m.text || '').replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
            return `[Slack / ${channel} — ${user}]\n${text}`;
          });
          return `## Slack Messages\n${snippets.join('\n\n')}`;
        }
        // search.messages worked but found nothing for this query — stop here.
        return '';
      }
      // data.ok === false means bot token or missing search:read — fall through to history scan.
    }
  } catch {
    // network error — fall through
  }

  // Fallback: scan conversations.history from channels the bot is a member of.
  // Requires bot scopes: channels:read, channels:history (+ groups:read/history for private).
  try {
    const listRes = await fetch(
      'https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=50',
      { headers }
    );
    if (!listRes.ok) return '';
    const listData = await listRes.json();
    if (!listData.ok) return '';

    const channels = (listData.channels || []).filter(c => c.is_member).slice(0, 10);
    if (!channels.length) return '';

    const words   = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matched = [];

    await Promise.all(channels.map(async ch => {
      try {
        const histRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${ch.id}&limit=100`,
          { headers }
        );
        if (!histRes.ok) return;
        const histData = await histRes.json();
        if (!histData.ok) return;

        for (const msg of (histData.messages || [])) {
          if (!msg.text || msg.subtype) continue;
          const text  = msg.text.replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
          const lower = text.toLowerCase();
          const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
          if (score > 0) matched.push({ score, channel: ch.name, user: msg.user || 'Unknown', text });
        }
      } catch {
        // skip channels that fail
      }
    }));

    if (!matched.length) return '';

    const snippets = matched
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(m => `[Slack / #${m.channel} — ${m.user}]\n${m.text}`);

    return `## Slack Messages\n${snippets.join('\n\n')}`;
  } catch {
    return '';
  }
}

/* ── /notion-search ─────────────────────────────────────── */

async function handleNotionSearch(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
  }

  const { query, notionToken } = body;
  const token = notionToken || env.NOTION_TOKEN;

  if (!token) {
    return corsResponse(JSON.stringify({ error: 'Notion token required' }), 400);
  }
  if (!query?.trim()) {
    return corsResponse(JSON.stringify({ error: 'query is required' }), 400);
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  let searchData;
  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: query.trim(),
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'relevance' },
        page_size: 10,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      return corsResponse(JSON.stringify({ error: err.message || 'Notion search failed' }), 502);
    }
    searchData = await res.json();
  } catch (err) {
    return corsResponse(JSON.stringify({ error: `Notion search error: ${err.message}` }), 502);
  }

  const pages = (searchData.results || []).slice(0, 10);

  // Fetch a brief snippet (first 5 blocks) for each page in parallel
  const results = await Promise.all(pages.map(async page => {
    const title = extractNotionTitle(page);
    const url   = page.url || `https://notion.so/${page.id.replace(/-/g, '')}`;

    // Build snippet: property values first (most useful for spec lookups), then first blocks
    const propSnippet = extractNotionProperties(page).slice(0, 140);
    let blockSnippet = '';
    try {
      const blocksRes = await fetch(
        `https://api.notion.com/v1/blocks/${page.id}/children?page_size=5`,
        { headers }
      );
      if (blocksRes.ok) {
        const blocksData = await blocksRes.json();
        blockSnippet = (blocksData.results || [])
          .map(b => blockToLine(b, 0))
          .filter(Boolean)
          .join(' ')
          .slice(0, 200);
      }
    } catch {
      // block snippet stays empty — not fatal
    }
    const snippet = [propSnippet, blockSnippet].filter(Boolean).join('  ·  ').slice(0, 280);

    return { id: page.id, title, url, snippet, lastEdited: page.last_edited_time };
  }));

  return corsResponse(JSON.stringify({ results }));
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

// Extracts all non-title property values from a database page entry.
// Database rows store specs (dimensions, weight, etc.) in properties, not blocks —
// without this, that structured data is invisible to the AI.
function extractNotionProperties(page) {
  const props = page.properties || {};
  const lines = [];

  for (const [key, prop] of Object.entries(props)) {
    if (prop.type === 'title') continue; // already used as the page title
    let value = '';
    switch (prop.type) {
      case 'rich_text':
        value = (prop.rich_text || []).map(t => t.plain_text).join('');
        break;
      case 'number':
        value = prop.number != null ? String(prop.number) : '';
        break;
      case 'select':
        value = prop.select?.name || '';
        break;
      case 'multi_select':
        value = (prop.multi_select || []).map(s => s.name).join(', ');
        break;
      case 'status':
        value = prop.status?.name || '';
        break;
      case 'checkbox':
        value = prop.checkbox ? 'Yes' : 'No';
        break;
      case 'date':
        value = prop.date?.start || '';
        break;
      case 'url':
        value = prop.url || '';
        break;
      case 'email':
        value = prop.email || '';
        break;
      case 'phone_number':
        value = prop.phone_number || '';
        break;
      case 'formula':
        value = prop.formula?.string ?? (prop.formula?.number != null ? String(prop.formula.number) : '');
        break;
      default:
        break;
    }
    if (value.toString().trim()) lines.push(`${key}: ${value.toString().trim()}`);
  }

  return lines.join('\n');
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

function richText(arr) {
  return (arr || []).map(t => t.plain_text).join('');
}

// Returns Notion page IDs mentioned inline (@mentions) in a block's rich_text.
function extractInlineMentionIds(block) {
  const content = block[block.type];
  if (!content) return [];
  return (content.rich_text || [])
    .filter(t => t.type === 'mention' && t.mention?.type === 'page' && t.mention.page?.id)
    .map(t => t.mention.page.id);
}

function blockToLine(block, depth) {
  const type    = block.type;
  const content = block[type];
  if (!content) return '';
  const indent  = '  '.repeat(depth);

  switch (type) {
    case 'heading_1':           return `# ${richText(content.rich_text)}`;
    case 'heading_2':           return `## ${richText(content.rich_text)}`;
    case 'heading_3':           return `### ${richText(content.rich_text)}`;
    case 'bulleted_list_item':  return `${indent}• ${richText(content.rich_text)}`;
    case 'numbered_list_item':  return `${indent}${richText(content.rich_text)}`;
    case 'to_do':               return `${indent}[${content.checked ? 'x' : ' '}] ${richText(content.rich_text)}`;
    case 'toggle':              return richText(content.rich_text);
    case 'callout':             return richText(content.rich_text);
    case 'quote':               return `> ${richText(content.rich_text)}`;
    case 'code':                return `\`\`\`\n${richText(content.rich_text)}\n\`\`\``;
    case 'table_row':           return (content.cells || []).map(c => richText(c)).join(' | ');
    case 'child_page':          return `## ${content.title || 'Subpage'}`;
    case 'child_database':      return `## Database: ${content.title || 'Untitled'}`;
    case 'bookmark': {
      const caption = richText(content.caption);
      return content.url ? `[Bookmark] ${caption || content.url}${caption ? ' — ' + content.url : ''}` : '';
    }
    case 'embed':               return content.url ? `[Embed] ${content.url}` : '';
    case 'image': {
      const cap = richText(content.caption);
      const url = content.type === 'external' ? content.external?.url : null;
      return [cap, url].filter(Boolean).join(' — ') || '';
    }
    case 'file': {
      const name = content.name || 'File';
      const cap  = richText(content.caption);
      const url  = content.type === 'external' ? content.external?.url : null;
      return `[File: ${name}]${url ? ' ' + url : ''}${cap ? ' — ' + cap : ''}`;
    }
    case 'pdf': {
      const name = content.name || 'PDF';
      const url  = content.type === 'external' ? content.external?.url : null;
      return `[PDF: ${name}]${url ? ' ' + url : ''}`;
    }
    case 'video': {
      const url = content.type === 'external' ? content.external?.url : null;
      const cap = richText(content.caption);
      return url ? `[Video${cap ? ': ' + cap : ''}] ${url}` : (cap ? `[Video: ${cap}]` : '');
    }
    case 'audio': {
      const url = content.type === 'external' ? content.external?.url : null;
      const cap = richText(content.caption);
      return url ? `[Audio${cap ? ': ' + cap : ''}] ${url}` : (cap ? `[Audio: ${cap}]` : '');
    }
    case 'divider':             return '---';
    // column_list / column / synced_block have no own text — content comes via has_children recursion
    case 'column_list':
    case 'column':
    case 'synced_block':        return '';
    default:                    return richText(content.rich_text);
  }
}

// Fetches ALL blocks for a given blockId — paginates until done, recurses into children.
// depth + blockCount guard against runaway pages.
async function extractNotionContent(blockId, headers, depth = 0, blockCount = { n: 0 }, visitedIds = new Set()) {
  const MAX_DEPTH  = 5;
  const MAX_BLOCKS = 500;
  if (depth > MAX_DEPTH || blockCount.n >= MAX_BLOCKS) return '';
  if (visitedIds.has(blockId)) return ''; // prevent cycles
  visitedIds.add(blockId);

  const lines      = [];
  const mentionIds = new Set(); // inline @page mentions to follow after pagination
  let   cursor     = undefined;

  do {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res  = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();

    for (const block of (data.results || [])) {
      if (blockCount.n++ >= MAX_BLOCKS) break;

      // Follow link_to_page references — fetch the linked page or database and inline its content
      if (block.type === 'link_to_page' && depth < MAX_DEPTH) {
        if (block.link_to_page?.page_id) {
          try {
            const linkedId = block.link_to_page.page_id;
            const [pageRes, linkedContent] = await Promise.all([
              fetch(`https://api.notion.com/v1/pages/${linkedId}`, { headers }).then(r => r.ok ? r.json() : null),
              extractNotionContent(linkedId, headers, depth + 1, blockCount, visitedIds),
            ]);
            if (pageRes) {
              const title = extractNotionTitle(pageRes);
              const props = extractNotionProperties(pageRes);
              const body  = [props, linkedContent].filter(Boolean).join('\n\n');
              lines.push(`### → ${title}${body.trim() ? '\n' + body.slice(0, 3000) : ''}`);
            }
          } catch {
            // skip failed link follows
          }
        } else if (block.link_to_page?.database_id) {
          try {
            const dbId  = block.link_to_page.database_id;
            const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ page_size: 10, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] }),
            });
            if (dbRes.ok) {
              const { results = [] } = await dbRes.json();
              const rows = results.map(row => {
                const t = extractNotionTitle(row);
                const p = extractNotionProperties(row);
                return [t ? `**${t}**` : null, p].filter(Boolean).join('\n');
              }).filter(Boolean);
              if (rows.length) lines.push(`### → Linked Database\n${rows.join('\n\n').slice(0, 2000)}`);
            }
          } catch {
            // skip failed database link follows
          }
        }
        continue;
      }

      // child_database blocks — query the inline database and include its rows
      if (block.type === 'child_database' && depth < MAX_DEPTH) {
        const dbTitle = block.child_database?.title || 'Table';
        lines.push(`## ${dbTitle}`);
        try {
          const dbRes = await fetch(`https://api.notion.com/v1/databases/${block.id}/query`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ page_size: 20, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] }),
          });
          if (dbRes.ok) {
            const { results = [] } = await dbRes.json();
            for (const row of results.slice(0, 15)) {
              if (blockCount.n++ >= MAX_BLOCKS) break;
              const rowTitle = extractNotionTitle(row);
              const rowProps = extractNotionProperties(row);
              const rowLine  = [rowTitle ? `**${rowTitle}**` : null, rowProps].filter(Boolean).join('\n');
              if (rowLine.trim()) lines.push(rowLine);
            }
          }
        } catch {
          // skip failed inline database queries
        }
        continue;
      }

      const line = blockToLine(block, depth);
      if (line.trim()) lines.push(line);

      // Collect inline @page mentions for deferred following
      for (const id of extractInlineMentionIds(block)) {
        if (!visitedIds.has(id)) mentionIds.add(id);
      }

      if (block.has_children) {
        const child = await extractNotionContent(block.id, headers, depth + 1, blockCount, visitedIds);
        if (child) lines.push(child);
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  // Follow inline @page mentions — cap at 3 per page to avoid blowup
  if (depth < MAX_DEPTH) {
    for (const mentionId of [...mentionIds].slice(0, 3)) {
      if (visitedIds.has(mentionId)) continue;
      try {
        const [pageRes, linkedContent] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${mentionId}`, { headers }).then(r => r.ok ? r.json() : null),
          extractNotionContent(mentionId, headers, depth + 1, blockCount, visitedIds),
        ]);
        if (pageRes) {
          const title = extractNotionTitle(pageRes);
          const props = extractNotionProperties(pageRes);
          const body  = [props, linkedContent].filter(Boolean).join('\n\n');
          if (body.trim()) lines.push(`### → ${title} (mentioned)\n${body.slice(0, 2000)}`);
        }
      } catch {
        // skip failed mention follows
      }
    }
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
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });

      if (!pageRes.ok) {
        const err = await pageRes.json();
        return corsResponse(JSON.stringify({ error: err.message || 'Notion API error — check your token and that the page is shared with your integration.' }), 502);
      }

      const pageData = await pageRes.json();
      const title    = extractNotionTitle(pageData);
      const props    = extractNotionProperties(pageData);    // database column values
      const blocks   = await extractNotionContent(pageId, headers, 0, { n: 0 }, new Set([pageId]));
      const content  = [props, blocks].filter(Boolean).join('\n\n');

      return corsResponse(JSON.stringify({ title, content: content.slice(0, 30000) }));
    } catch (err) {
      return corsResponse(JSON.stringify({ error: `Notion fetch failed: ${err.message}` }), 502);
    }
  }

  return corsResponse(JSON.stringify({ error: `Unknown source type: ${type}` }), 400);
}

/* ── /training ───────────────────────────────────────────── */

const TRAINING_KEY = 'shared';

async function handleGetTraining(env) {
  const raw = await env.TRAINING_KV.get(TRAINING_KEY);
  if (!raw) return corsResponse(JSON.stringify(null));
  return corsResponse(raw);
}

async function handlePutTraining(request, env) {
  let body;
  try {
    body = await request.text();
    JSON.parse(body); // validate JSON
  } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
  }
  await env.TRAINING_KV.put(TRAINING_KEY, body);
  return corsResponse(JSON.stringify({ ok: true }));
}

/* ── Notion OAuth ────────────────────────────────────────── */

const NOTION_REDIRECT_URI = 'https://beacon-worker.kevin-garma.workers.dev/notion-callback';

async function handleNotionAuth(request, env) {
  if (!env.NOTION_CLIENT_ID) {
    return corsResponse(JSON.stringify({ error: 'Notion OAuth is not configured on this server.' }), 500);
  }

  let body = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  const redirectOrigin = body.redirect_origin || 'https://kevingarma-star.github.io';

  // Store state → redirectOrigin in KV with 5-minute TTL
  const state = crypto.randomUUID();
  await env.TRAINING_KV.put(`oauth_state_${state}`, redirectOrigin, { expirationTtl: 300 });

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', env.NOTION_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', NOTION_REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  return corsResponse(JSON.stringify({ url: authUrl.toString() }));
}

async function handleNotionCallback(request, env) {
  const url          = new URL(request.url);
  const code         = url.searchParams.get('code');
  const state        = url.searchParams.get('state');
  const errorParam   = url.searchParams.get('error');

  // Look up redirect origin from KV
  const redirectOrigin = state ? await env.TRAINING_KV.get(`oauth_state_${state}`) : null;
  const appBase        = (redirectOrigin || 'https://kevingarma-star.github.io') + '/beacon/';

  if (errorParam || !code) {
    return Response.redirect(`${appBase}#notion_error=${encodeURIComponent(errorParam || 'no_code')}`, 302);
  }
  if (!redirectOrigin) {
    return Response.redirect(`${appBase}#notion_error=invalid_state`, 302);
  }

  // Clean up state
  await env.TRAINING_KV.delete(`oauth_state_${state}`);

  // Exchange code for access token
  try {
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: NOTION_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      const msg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      return Response.redirect(`${appBase}#notion_error=${encodeURIComponent(msg)}`, 302);
    }

    return Response.redirect(
      `${appBase}#notion_token=${encodeURIComponent(tokenData.access_token)}`,
      302
    );
  } catch (err) {
    return Response.redirect(`${appBase}#notion_error=${encodeURIComponent(err.message)}`, 302);
  }
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

    if (pathname === '/training' && request.method === 'GET') {
      return handleGetTraining(env);
    }

    if (pathname === '/training' && request.method === 'PUT') {
      return handlePutTraining(request, env);
    }

    if (pathname === '/notion-search' && request.method === 'POST') {
      return handleNotionSearch(request, env);
    }

    if (pathname === '/suggest' && request.method === 'POST') {
      return handleSuggest(request, env);
    }

    if (pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (pathname === '/fetch-source' && request.method === 'POST') {
      return handleFetchSource(request, env);
    }

    if (pathname === '/notion-auth' && request.method === 'POST') {
      return handleNotionAuth(request, env);
    }

    // GET — Notion redirects here after user approves; returns a browser redirect, no CORS needed
    if (pathname === '/notion-callback' && request.method === 'GET') {
      return handleNotionCallback(request, env);
    }

    return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
  },
};
