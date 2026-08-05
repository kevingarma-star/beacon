import { useState } from 'react'
import './NotionSearch.css'

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? ''

function NotionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

function ResultCard({ result, notionToken, addSource }) {
  const [adding, setAdding]         = useState(false)
  const [added, setAdded]           = useState(false)
  const [addError, setAddError]     = useState('')
  const [expanded, setExpanded]     = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [pageContent, setPageContent] = useState(null) // null = not fetched yet

  async function fetchContent() {
    if (pageContent !== null) return pageContent
    const res = await fetch(`${WORKER_URL}/fetch-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'notion', url: result.url, token: notionToken }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch page')
    setPageContent(data.content)
    return data.content
  }

  async function handleTogglePreview() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (pageContent !== null) return
    setPreviewing(true)
    try {
      await fetchContent()
    } catch (err) {
      setPageContent(`Error loading page: ${err.message}`)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleAdd() {
    setAdding(true)
    setAddError('')
    try {
      const content = await fetchContent()
      addSource({
        type: 'notion',
        name: result.title || 'Notion Page',
        content,
        sourceUrl: result.url,
        notionToken,
      })
      setAdded(true)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const date = result.lastEdited
    ? new Date(result.lastEdited).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className={`ns-card${expanded ? ' ns-card--expanded' : ''}`}>
      <div className="ns-card-main">
        <div className="ns-card-icon"><NotionIcon /></div>
        <div className="ns-card-body">
          <div className="ns-card-title">{result.title || 'Untitled'}</div>
          {result.snippet && <div className="ns-card-snippet">{result.snippet}</div>}
          <div className="ns-card-footer">
            {date && <span className="ns-card-meta">Edited {date}</span>}
            {addError && <span className="ns-card-error">{addError}</span>}
          </div>
        </div>
        <div className="ns-card-actions">
          <button
            type="button"
            className="ns-preview-btn"
            onClick={handleTogglePreview}
          >
            {expanded ? 'Collapse' : 'Preview'}
          </button>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="ns-open-btn"
            title="Open in Notion"
          >
            <ExternalLinkIcon />
          </a>
          <button
            type="button"
            className={`src-btn-primary ns-add-btn${added ? ' ns-add-btn--done' : ''}`}
            onClick={handleAdd}
            disabled={adding || added}
          >
            {adding ? 'Adding…' : added ? '✓ Added' : 'Add to Sources'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ns-preview">
          {previewing ? (
            <div className="ns-preview-loading"><span className="spinner" /> Loading page…</div>
          ) : (
            <pre className="ns-preview-text">{pageContent}</pre>
          )}
        </div>
      )}
    </div>
  )
}

export default function NotionSearch({ connections, addSource }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const hasToken = !!connections.notionToken

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim() || !hasToken) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const res = await fetch(`${WORKER_URL}/notion-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), notionToken: connections.notionToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!hasToken) {
    return (
      <div className="ns-page">
        <div className="ns-empty ns-empty--gate">
          <span className="ns-empty-icon"><NotionIcon /></span>
          <p className="ns-empty-title">Notion not connected</p>
          <p className="ns-empty-sub">
            Go to <strong>Sources → Workspace Connections</strong> and add your Notion integration token to enable search.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ns-page">
      <form className="ns-bar" onSubmit={handleSearch}>
        <span className="ns-bar-icon"><SearchIcon /></span>
        <input
          className="ns-input"
          type="text"
          placeholder="Search your Notion workspace…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <button className="src-btn-primary ns-search-btn" type="submit" disabled={loading || !query.trim()}>
          {loading ? <><span className="spinner" />&nbsp;Searching…</> : 'Search'}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {results !== null && results.length === 0 && (
        <div className="ns-empty">
          <p className="ns-empty-title">No pages found</p>
          <p className="ns-empty-sub">
            Try different keywords, or check that the pages are shared with your integration.
          </p>
        </div>
      )}

      {results !== null && results.length > 0 && (
        <>
          <div className="ns-results-meta">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
          <div className="ns-results">
            {results.map(r => (
              <ResultCard
                key={r.id}
                result={r}
                notionToken={connections.notionToken}
                addSource={addSource}
              />
            ))}
          </div>
        </>
      )}

      {results === null && !loading && !error && (
        <div className="ns-empty ns-empty--hint">
          <p className="ns-empty-sub">
            Search for pages, docs, FAQs, or SOPs across your connected Notion workspace.
            Click <strong>Preview</strong> to read the full page, or <strong>Add to Sources</strong> to feed it into the AI.
          </p>
        </div>
      )}
    </div>
  )
}
