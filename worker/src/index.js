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
  } = body;

  if (!concern || typeof concern !== 'string' || !concern.trim()) {
    return corsResponse(JSON.stringify({ error: 'concern is required' }), 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
  }

  // Search live workspaces and prepend results to any manual sources (all modes)
  let combinedContext = knowledgeContext || '';
  if (notionToken || intercomToken) {
    const [notionCtx, intercomCtx] = await Promise.all([
      notionToken   ? searchNotionContext(concern.trim(), notionToken, env)    : Promise.resolve(''),
      intercomToken ? fetchIntercomContext(concern.trim(), intercomToken)       : Promise.resolve(''),
    ]);

    const liveCtx = [notionCtx, intercomCtx].filter(Boolean).join('\n\n---\n\n');
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
    knowledgeContext, notionToken, intercomToken,
  } = body;

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return corsResponse(JSON.stringify({ error: 'messages must end with a user turn' }), 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), 500);
  }

  // Search live workspaces based on the latest user message
  let combinedContext = knowledgeContext || '';
  if (notionToken || intercomToken) {
    const latestQuery = messages[messages.length - 1].content;
    const [notionCtx, intercomCtx] = await Promise.all([
      notionToken   ? searchNotionContext(latestQuery, notionToken, env)    : Promise.resolve(''),
      intercomToken ? fetchIntercomContext(latestQuery, intercomToken)       : Promise.resolve(''),
    ]);
    const liveCtx = [notionCtx, intercomCtx].filter(Boolean).join('\n\n---\n\n');
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

async function searchNotionContext(query, token, env) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // === Full-workspace index path (preferred) ===
  // If the user has run "Sync Workspace", use the local KV index to score ALL pages
  // by keyword match on title + content snippet, then fetch full content for top hits.
  if (env?.TRAINING_KV) {
    try {
      const raw = await env.TRAINING_KV.get(NOTION_INDEX_KEY);
      if (raw) {
        const { pages = [] } = JSON.parse(raw);
        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        const scored = pages
          .map(p => {
            const text  = `${p.title} ${p.snippet || ''}`.toLowerCase();
            const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
            return { ...p, score };
          })
          .sort((a, b) => b.score - a.score);

        const topMatches = scored.filter(p => p.score > 0).slice(0, 6);
        if (topMatches.length > 0) {
          const sections = [];
          for (const page of topMatches) {
            try {
              const blocks = await extractNotionContent(page.id, headers, 0, { n: 0 }, query);
              if (blocks.trim()) sections.push(`### ${page.title}\n${blocks.slice(0, 6000)}`);
            } catch { /* skip */ }
          }
          if (sections.length > 0) return sections.join('\n\n---\n\n');
        }
        // Index exists but nothing scored — fall through to live search
      }
    } catch { /* fall through to live search on any KV error */ }
  }
  // === End index path; live search below is the fallback ===

  // Run page search + database discovery in parallel
  const [pageResult, dbResult] = await Promise.allSettled([
    fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'relevance' },
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

  // Database fallback: query each accessible DB for pages whose title matches the query
  const existingIds = new Set(pageResults.map(p => p.id));
  const words       = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let dbPages = [];

  if (databases.length > 0 && words.length > 0) {
    const buckets = await Promise.all(databases.map(async db => {
      try {
        const r = await fetch(`https://api.notion.com/v1/databases/${db.id}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ page_size: 20 }),
        });
        if (!r.ok) return [];
        const { results = [] } = await r.json();
        const scored = results
          .map(p => {
            const title = extractNotionTitle(p).toLowerCase();
            const score = words.reduce((n, w) => n + (title.includes(w) ? 1 : 0), 0);
            return { ...p, _score: score };
          })
          .filter(p => !existingIds.has(p.id))
          .sort((a, b) => b._score - a._score);
        // Prefer keyword-matched articles; fall back to top 1 if nothing scores —
        // ensures KB content is always surfaced even when titles don't match query terms
        const matched = scored.filter(p => p._score > 0).slice(0, 2);
        return matched.length ? matched : scored.slice(0, 1);
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
      const blocks = await extractNotionContent(page.id, headers, 0, { n: 0 }, query);
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
    default:                    return richText(content.rich_text);
  }
}

// Queries an inline (child_database) block for relevant rows and returns their content.
// Falls back to top articles when no title keyword matches — ensures KB content always surfaces.
async function fetchChildDatabaseContent(dbId, headers, query, depth, blockCount) {
  const MAX_BLOCKS = 500;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 20 }),
    });
    if (!res.ok) return '';
    const { results = [] } = await res.json();
    if (!results.length) return '';

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = results
      .map(p => {
        const title = extractNotionTitle(p).toLowerCase();
        const score = words.reduce((n, w) => n + (title.includes(w) ? 1 : 0), 0);
        return { ...p, _score: score };
      })
      .sort((a, b) => b._score - a._score);

    // Take top keyword-matched articles; fall back to first 3 if nothing scores
    const top = scored[0]?._score > 0
      ? scored.filter(p => p._score > 0).slice(0, 4)
      : scored.slice(0, 3);

    const sections = [];
    for (const page of top) {
      if (blockCount.n >= MAX_BLOCKS) break;
      const title   = extractNotionTitle(page);
      const props   = extractNotionProperties(page);
      const content = await extractNotionContent(page.id, headers, depth, blockCount, query);
      const body    = [props, content].filter(Boolean).join('\n\n');
      if (body.trim()) sections.push(`### ${title}\n${body.slice(0, 3000)}`);
    }
    return sections.join('\n\n');
  } catch {
    return '';
  }
}

// Fetches ALL blocks for a given blockId — paginates until done, recurses into children.
// depth + blockCount guard against runaway pages.
// query is passed through so child_database blocks can score their rows relevantly.
async function extractNotionContent(blockId, headers, depth = 0, blockCount = { n: 0 }, query = '') {
  const MAX_DEPTH  = 5;
  const MAX_BLOCKS = 500;
  if (depth > MAX_DEPTH || blockCount.n >= MAX_BLOCKS) return '';

  const lines  = [];
  let   cursor = undefined;

  do {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res  = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();

    for (const block of (data.results || [])) {
      if (blockCount.n++ >= MAX_BLOCKS) break;

      // Inline databases need a /query call, not /blocks/children — handle them explicitly
      if (block.type === 'child_database' && depth < 3) {
        const dbTitle = block.child_database?.title;
        if (dbTitle) lines.push(`## ${dbTitle}`);
        const dbContent = await fetchChildDatabaseContent(block.id, headers, query, depth + 1, blockCount);
        if (dbContent) lines.push(dbContent);
        continue;
      }

      // Emit title for child pages so the heading appears even before recursing
      if (block.type === 'child_page') {
        const pageTitle = block.child_page?.title;
        if (pageTitle) lines.push(`## ${pageTitle}`);
      } else {
        const line = blockToLine(block, depth);
        if (line.trim()) lines.push(line);
      }

      if (block.has_children && block.type !== 'child_database') {
        const child = await extractNotionContent(block.id, headers, depth + 1, blockCount, query);
        if (child) lines.push(child);
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

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
      const blocks   = await extractNotionContent(pageId, headers);
      const content  = [props, blocks].filter(Boolean).join('\n\n');

      return corsResponse(JSON.stringify({ title, content: content.slice(0, 30000) }));
    } catch (err) {
      return corsResponse(JSON.stringify({ error: `Notion fetch failed: ${err.message}` }), 502);
    }
  }

  return corsResponse(JSON.stringify({ error: `Unknown source type: ${type}` }), 400);
}

/* ── /notion-sync ────────────────────────────────────────── */

// Crawls ALL accessible Notion pages and stores a full-text index in KV.
// At query time we score the entire index locally — no more missing articles.
async function handleNotionSyncAll(request, env) {
  let body;
  try { body = await request.json(); } catch {
    return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400);
  }

  const { notionToken } = body;
  if (!notionToken) return corsResponse(JSON.stringify({ error: 'notionToken required' }), 400);
  if (!env.TRAINING_KV) return corsResponse(JSON.stringify({ error: 'KV not configured' }), 500);

  const headers = {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // Step 1: Paginate through ALL accessible pages (no query = all pages by recency)
  const allPages = [];
  let cursor = undefined;
  do {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) break;
    const data = await res.json();
    allPages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && allPages.length < 300);

  // Step 2: Fetch shallow content in parallel batches of 10
  const BATCH = 10;
  const indexed = [];

  for (let i = 0; i < allPages.length; i += BATCH) {
    const batch = allPages.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async page => {
      const title  = extractNotionTitle(page);
      const props  = extractNotionProperties(page);
      let blockText = '';
      try {
        const res = await fetch(
          `https://api.notion.com/v1/blocks/${page.id}/children?page_size=30`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          blockText = (data.results || [])
            .map(b => blockToLine(b, 0))
            .filter(Boolean)
            .join('\n')
            .slice(0, 1200);
        }
      } catch { /* skip failed pages */ }
      const snippet = [props, blockText].filter(Boolean).join('\n').slice(0, 1200);
      return { id: page.id, title, snippet };
    }));
    indexed.push(...results);
  }

  // Step 3: Persist index in KV
  const index = { syncedAt: new Date().toISOString(), pages: indexed };
  await env.TRAINING_KV.put(NOTION_INDEX_KEY, JSON.stringify(index));

  return corsResponse(JSON.stringify({ ok: true, count: indexed.length, syncedAt: index.syncedAt }));
}

async function handleNotionSyncStatus(env) {
  if (!env.TRAINING_KV) return corsResponse(JSON.stringify({ synced: false }));
  const raw = await env.TRAINING_KV.get(NOTION_INDEX_KEY);
  if (!raw) return corsResponse(JSON.stringify({ synced: false }));
  try {
    const { syncedAt, pages } = JSON.parse(raw);
    return corsResponse(JSON.stringify({ synced: true, count: pages?.length ?? 0, syncedAt }));
  } catch {
    return corsResponse(JSON.stringify({ synced: false }));
  }
}

/* ── /training ───────────────────────────────────────────── */

const TRAINING_KEY  = 'shared';
const NOTION_INDEX_KEY = 'notion-index';

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

    if (pathname === '/notion-sync-all' && request.method === 'POST') {
      return handleNotionSyncAll(request, env);
    }

    if (pathname === '/notion-sync-status' && request.method === 'GET') {
      return handleNotionSyncStatus(env);
    }

    return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
  },
};
