import { useState, useEffect } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? ''

function NotionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/>
    </svg>
  )
}

function IntercomIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
    </svg>
  )
}

function ConnectionCard({ name, icon, tokenPlaceholder, hint, connected, onConnect, onDisconnect }) {
  const [draft, setDraft]       = useState('')
  const [expanded, setExpanded] = useState(false)

  function handleConnect(e) {
    e.preventDefault()
    if (!draft.trim()) return
    onConnect(draft.trim())
    setDraft('')
    setExpanded(false)
  }

  function handleDisconnect() {
    onDisconnect()
    setExpanded(false)
  }

  return (
    <div className={`conn-card${connected ? ' conn-card--connected' : ''}`}>
      <div className="conn-card-header">
        <span className="conn-card-icon">{icon}</span>
        <span className="conn-card-name">{name}</span>
        {connected ? (
          <>
            <span className="conn-badge">Connected</span>
            <button type="button" className="conn-disconnect" onClick={handleDisconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            className="conn-expand"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Cancel' : 'Connect'}
          </button>
        )}
      </div>

      {!connected && expanded && (
        <form className="conn-form" onSubmit={handleConnect}>
          {hint && <p className="conn-hint">{hint}</p>}
          <div className="conn-form-row">
            <input
              type="password"
              className="train-input"
              placeholder={tokenPlaceholder}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
            <button className="src-btn-primary" type="submit" disabled={!draft.trim()}>
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function NotionSyncPanel({ notionToken }) {
  const [status, setStatus]     = useState(null)   // { synced, count, syncedAt } | null
  const [syncing, setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    fetch(`${WORKER_URL}/notion-sync-status`)
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {})
  }, [notionToken])

  async function handleSync() {
    setSyncing(true); setSyncError('')
    try {
      const res = await fetch(`${WORKER_URL}/notion-sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setStatus({ synced: true, count: data.count, syncedAt: data.syncedAt })
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  function formatSyncDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="notion-sync-panel">
      <div className="notion-sync-info">
        {status === null
          ? 'Checking sync status…'
          : status.synced
            ? `${status.count} pages indexed · Last synced ${formatSyncDate(status.syncedAt)}`
            : 'Workspace not yet indexed — queries fall back to live keyword search'}
      </div>
      <button
        type="button"
        className="src-btn-primary"
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? 'Syncing…' : status?.synced ? 'Re-sync Workspace' : 'Sync Workspace'}
      </button>
      {syncError && <p className="source-form-error">{syncError}</p>}
      {syncing && (
        <p className="notion-sync-hint">
          Reading all your Notion pages — this may take 15–30 seconds for large workspaces.
        </p>
      )}
    </div>
  )
}

export default function Connections({ connections, onSave, onRemove }) {
  return (
    <div className="connections-section">
      <div className="connections-header">
        <span className="connections-title">Workspace Connections</span>
        <span className="connections-sub">
          Connected workspaces are searched automatically when you use Ask Anything.
        </span>
      </div>

      <ConnectionCard
        name="Notion"
        icon={<NotionIcon />}
        tokenPlaceholder="secret_xxxx… or ntn_xxxx…"
        hint="Create an integration at notion.so/my-integrations, then share the pages you want searchable with that integration."
        connected={!!connections.notionToken}
        onConnect={token => onSave({ notionToken: token })}
        onDisconnect={() => onRemove('notionToken')}
      />

      {connections.notionToken && (
        <NotionSyncPanel notionToken={connections.notionToken} />
      )}

      <ConnectionCard
        name="Intercom"
        icon={<IntercomIcon />}
        tokenPlaceholder="Your Intercom access token"
        hint="Go to your Intercom Developer Hub → Your app → Authentication → Access Token. All published Help Center articles will be searched."
        connected={!!connections.intercomToken}
        onConnect={token => onSave({ intercomToken: token })}
        onDisconnect={() => onRemove('intercomToken')}
      />
    </div>
  )
}
