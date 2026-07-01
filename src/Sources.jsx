import { useState, useRef } from 'react'
import './Sources.css'

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? ''

/* ── Source type definitions ─────────────────────────────── */

const SOURCE_TYPES = [
  {
    id: 'notion',
    label: 'Notion',
    desc: 'Sync a Notion page via your integration token',
    icon: NotionIcon,
    color: 'rgba(255,255,255,.06)',
    border: 'rgba(255,255,255,.12)',
  },
  {
    id: 'url',
    label: 'Web URL',
    desc: 'Fetch any public webpage or help center article',
    icon: UrlIcon,
    color: 'rgba(203,238,255,.06)',
    border: 'rgba(203,238,255,.15)',
  },
  {
    id: 'file',
    label: 'File Upload',
    desc: 'Upload a .txt or .md file from your computer',
    icon: FileIcon,
    color: 'rgba(39,174,96,.06)',
    border: 'rgba(39,174,96,.2)',
  },
  {
    id: 'text',
    label: 'Text Snippet',
    desc: 'Paste any text — policies, FAQs, scripts',
    icon: TextIcon,
    color: 'rgba(242,90,84,.06)',
    border: 'rgba(242,90,84,.2)',
  },
]

/* ── Icons ───────────────────────────────────────────────── */

function NotionIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/>
    </svg>
  )
}

function UrlIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

function FileIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10,9 9,9 8,9"/>
    </svg>
  )
}

function TextIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="17" y1="10" x2="3" y2="10"/>
      <line x1="21" y1="6"  x2="3" y2="6"/>
      <line x1="21" y1="14" x2="3" y2="14"/>
      <line x1="17" y1="18" x2="3" y2="18"/>
    </svg>
  )
}

function SyncIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

function typeIcon(type, size) {
  const t = SOURCE_TYPES.find(s => s.id === type)
  if (!t) return null
  const Icon = t.icon
  return <Icon size={size} />
}

/* ── Source type card ────────────────────────────────────── */

function TypeCard({ def, active, onClick }) {
  const Icon = def.icon
  return (
    <button
      type="button"
      className={`type-card${active ? ' type-card--active' : ''}`}
      onClick={onClick}
      style={active ? { background: def.color, borderColor: def.border } : {}}
    >
      <span className="type-card-icon"><Icon size={22} /></span>
      <span className="type-card-label">{def.label}</span>
      <span className="type-card-desc">{def.desc}</span>
    </button>
  )
}

/* ── Add source forms ────────────────────────────────────── */

function NotionForm({ onAdd, onCancel }) {
  const [pageUrl, setPageUrl]   = useState('')
  const [token, setToken]       = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!pageUrl.trim() || !token.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${WORKER_URL}/fetch-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notion', url: pageUrl.trim(), token: token.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAdd({
        type: 'notion',
        name: name.trim() || data.title || 'Notion Page',
        content: data.content,
        sourceUrl: pageUrl.trim(),
        notionToken: token.trim(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="source-form" onSubmit={handleSubmit}>
      <div className="source-form-steps">
        <p className="source-form-hint">
          You need a Notion <strong>Internal Integration</strong> token (not an OAuth connection).
        </p>
        <ol className="source-form-steps-list">
          <li>Go to <code>notion.so/my-integrations</code> → <strong>New integration</strong> → pick your workspace → copy the token (starts with <code>ntn_</code> or <code>secret_</code>)</li>
          <li>Open your Notion page → top-right <strong>···</strong> menu → <strong>Connections</strong> → connect your integration</li>
          <li>Paste the token and page URL below</li>
        </ol>
        <p className="source-form-hint" style={{ marginTop: 0 }}>
          No workspace showing? You need to be a workspace <strong>admin</strong>. Alternatively, ask Claude to sync the page for you — it already has Notion access.
        </p>
      </div>
      <div className="source-form-row">
        <div className="source-form-field">
          <label className="train-label">Integration Token</label>
          <input className="train-input" type="password" placeholder="secret_xxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} />
        </div>
        <div className="source-form-field">
          <label className="train-label">Custom Name (optional)</label>
          <input className="train-input" placeholder="e.g. FAQ Page" value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>
      <div className="source-form-field">
        <label className="train-label">Notion Page URL</label>
        <input className="train-input" placeholder="https://notion.so/your-workspace/Page-Name-abc123" value={pageUrl} onChange={e => setPageUrl(e.target.value)} />
      </div>
      {error && <p className="source-form-error">{error}</p>}
      <div className="source-form-actions">
        <button type="button" className="src-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="src-btn-primary" type="submit" disabled={loading || !pageUrl.trim() || !token.trim()}>
          {loading ? 'Syncing…' : 'Sync Page'}
        </button>
      </div>
    </form>
  )
}

function UrlForm({ onAdd, onCancel }) {
  const [url, setUrl]         = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${WORKER_URL}/fetch-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAdd({
        type: 'url',
        name: name.trim() || new URL(url.trim()).hostname,
        content: data.content,
        sourceUrl: url.trim(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="source-form" onSubmit={handleSubmit}>
      <p className="source-form-hint">
        Fetched via the Beacon Worker — works with public pages, help centers, and docs.
      </p>
      <div className="source-form-row">
        <div className="source-form-field">
          <label className="train-label">Page URL</label>
          <input className="train-input" placeholder="https://help.example.com/returns" value={url} onChange={e => setUrl(e.target.value)} />
        </div>
        <div className="source-form-field">
          <label className="train-label">Custom Name (optional)</label>
          <input className="train-input" placeholder="e.g. Return Policy" value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>
      {error && <p className="source-form-error">{error}</p>}
      <div className="source-form-actions">
        <button type="button" className="src-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="src-btn-primary" type="submit" disabled={loading || !url.trim()}>
          {loading ? 'Fetching…' : 'Fetch Page'}
        </button>
      </div>
    </form>
  )
}

function FileForm({ onAdd, onCancel }) {
  const [name, setName]   = useState('')
  const [error, setError] = useState('')
  const fileRef           = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = ev => {
      onAdd({ type: 'file', name: name.trim() || file.name, content: ev.target.result })
    }
    reader.onerror = () => setError('Could not read file.')
    reader.readAsText(file)
  }

  return (
    <div className="source-form">
      <p className="source-form-hint">Supports <code>.txt</code> and <code>.md</code> files. Content is read locally — nothing is uploaded.</p>
      <div className="source-form-row">
        <div className="source-form-field">
          <label className="train-label">Custom Name (optional)</label>
          <input className="train-input" placeholder="e.g. Product Manual" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="source-form-field">
          <label className="train-label">File</label>
          <button type="button" className="file-pick-btn" onClick={() => fileRef.current?.click()}>
            Choose file (.txt, .md)
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      </div>
      {error && <p className="source-form-error">{error}</p>}
      <div className="source-form-actions">
        <button type="button" className="src-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function TextForm({ onAdd, onCancel }) {
  const [name, setName]       = useState('')
  const [content, setContent] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !content.trim()) return
    onAdd({ type: 'text', name: name.trim(), content: content.trim() })
  }

  return (
    <form className="source-form" onSubmit={handleSubmit}>
      <p className="source-form-hint">Paste any text — return policies, pricing, escalation scripts, product FAQs.</p>
      <div className="source-form-field">
        <label className="train-label">Source Name</label>
        <input className="train-input" placeholder="e.g. Refund Policy" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="source-form-field">
        <label className="train-label">Content</label>
        <textarea className="train-textarea" rows={8} placeholder="Paste your content here…" value={content} onChange={e => setContent(e.target.value)} />
      </div>
      <div className="source-form-actions">
        <button type="button" className="src-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="src-btn-primary" type="submit" disabled={!name.trim() || !content.trim()}>
          Save Source
        </button>
      </div>
    </form>
  )
}

/* ── Source card ─────────────────────────────────────────── */

function SourceCard({ source, onRemove, onToggle, onResync }) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  const chars = source.content?.length ?? 0
  const label = chars > 1000 ? `${(chars / 1000).toFixed(1)}K chars` : `${chars} chars`

  async function handleResync() {
    if (!source.sourceUrl) return
    setSyncing(true); setSyncError('')
    try {
      const res = await fetch(`${WORKER_URL}/fetch-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: source.type,
          url: source.sourceUrl,
          token: source.notionToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onResync(source.id, data.content)
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className={`src-card${source.active ? '' : ' src-card--inactive'}`}>
      <div className="src-card-icon">{typeIcon(source.type, 16)}</div>
      <div className="src-card-body">
        <div className="src-card-top">
          <span className="src-card-name">{source.name}</span>
          <span className="src-card-meta">{SOURCE_TYPES.find(t => t.id === source.type)?.label} &middot; {label}</span>
        </div>
        {source.sourceUrl && (
          <span className="src-card-url">{source.sourceUrl}</span>
        )}
        {syncError && <span className="src-card-error">{syncError}</span>}
      </div>
      <div className="src-card-actions">
        {(source.type === 'notion' || source.type === 'url') && (
          <button
            type="button"
            className="src-action-btn"
            onClick={handleResync}
            disabled={syncing}
            title="Re-sync content"
          >
            <span style={syncing ? { animation: 'spin .7s linear infinite', display: 'inline-block' } : {}}>
              <SyncIcon />
            </span>
          </button>
        )}
        <button
          type="button"
          className={`src-toggle${source.active ? ' src-toggle--on' : ''}`}
          onClick={() => onToggle(source.id)}
          title={source.active ? 'Deactivate' : 'Activate'}
        >
          <span className="src-toggle-dot" />
        </button>
        <button
          type="button"
          className="src-remove-btn"
          onClick={() => onRemove(source.id)}
          title="Remove source"
        >
          &#x2715;
        </button>
      </div>
    </div>
  )
}

/* ── Main Sources component ──────────────────────────────── */

export default function Sources({ sources, addSource, removeSource, toggleSource, updateSource, activeCount, totalChars }) {
  const [selectedType, setSelectedType] = useState(null)

  function handleAdd(source) {
    addSource(source)
    setSelectedType(null)
  }

  function handleCancel() {
    setSelectedType(null)
  }

  function handleResync(id, content) {
    updateSource(id, { content, syncedAt: new Date().toISOString() })
  }

  const charsLabel = totalChars > 1000 ? `${(totalChars / 1000).toFixed(1)}K` : totalChars

  return (
    <div className="sources-page">

      {/* ── Stats bar ── */}
      <div className="sources-stats">
        <div className="sources-stat">
          <span className="sources-stat-val">{activeCount}</span>
          <span className="sources-stat-label">active source{activeCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="sources-stat-divider" />
        <div className="sources-stat">
          <span className="sources-stat-val">{charsLabel}</span>
          <span className="sources-stat-label">characters in context</span>
        </div>
        <div className="sources-stat-divider" />
        <span className="sources-stat-hint">
          {activeCount > 0
            ? 'Active sources are injected into every generation call.'
            : 'Connect a source below to give the AI access to your knowledge base.'}
        </span>
      </div>

      {/* ── Type selector ── */}
      <div className="type-selector">
        {SOURCE_TYPES.map(def => (
          <TypeCard
            key={def.id}
            def={def}
            active={selectedType === def.id}
            onClick={() => setSelectedType(selectedType === def.id ? null : def.id)}
          />
        ))}
      </div>

      {/* ── Add form ── */}
      {selectedType === 'notion' && <NotionForm onAdd={handleAdd} onCancel={handleCancel} />}
      {selectedType === 'url'    && <UrlForm    onAdd={handleAdd} onCancel={handleCancel} />}
      {selectedType === 'file'   && <FileForm   onAdd={handleAdd} onCancel={handleCancel} />}
      {selectedType === 'text'   && <TextForm   onAdd={handleAdd} onCancel={handleCancel} />}

      {/* ── Sources list ── */}
      {sources.length === 0 ? (
        <div className="sources-empty">
          <p className="sources-empty-title">No sources connected</p>
          <p className="sources-empty-sub">Choose a source type above to get started.</p>
        </div>
      ) : (
        <div className="sources-list">
          <span className="sources-list-label">Connected sources</span>
          {sources.map(s => (
            <SourceCard
              key={s.id}
              source={s}
              onRemove={removeSource}
              onToggle={toggleSource}
              onResync={handleResync}
            />
          ))}
        </div>
      )}

    </div>
  )
}
