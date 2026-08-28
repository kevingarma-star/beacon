import { useState } from 'react'
import './Connectors.css'
import NotionSearch from './NotionSearch'

/* ── Icons ───────────────────────────────────────────────── */

function NotionIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z" />
    </svg>
  )
}

function IntercomIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
    </svg>
  )
}

function SlackIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.123 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.521V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.166 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.123a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.166 24a2.527 2.527 0 0 1-2.52-2.522v-2.521h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.312z" />
    </svg>
  )
}

function GmailIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.908 1.528-1.146C21.69 2.28 24 3.434 24 5.457z" />
    </svg>
  )
}

function CalendarIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function DriveIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5L7.71 3.5zm8.06 0L9.14 15h13.12l-3.43-6-3.06-5.5zM1.15 15L4.58 21h14.84l3.43-6H1.15z" />
    </svg>
  )
}

/* ── Connector definitions ───────────────────────────────── */

const CONNECTORS = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Searches your entire Notion workspace — pages, docs, and databases are queried live on every generation.',
    tokenKey: 'notionToken',
    placeholder: 'secret_xxxx… or ntn_xxxx…',
    hint: 'Create an integration at notion.so/my-integrations, then open the pages you want searchable and share them with that integration via the ··· menu → Connections.',
    iconColor: '#fff',
    accentColor: 'rgba(255,255,255,0.1)',
    icon: NotionIcon,
    status: 'active',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    description: 'Searches all published Help Center articles automatically on every query.',
    tokenKey: 'intercomToken',
    placeholder: 'Your Intercom access token',
    hint: 'Go to Developer Hub → Your app → Authentication → Access Token. All published articles will be searched.',
    iconColor: '#5cb8f0',
    accentColor: 'rgba(31,141,237,0.12)',
    icon: IntercomIcon,
    status: 'active',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Searches messages and threads across your Slack workspace.',
    tokenKey: 'slackToken',
    placeholder: 'xoxp-xxxx… (User OAuth token)',
    hint: 'Create a Slack app → OAuth & Permissions → add the search:read scope → Install to workspace → copy the User OAuth Token.',
    iconColor: '#e8738a',
    accentColor: 'rgba(224,30,90,0.10)',
    icon: SlackIcon,
    status: 'active',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search and surface relevant emails from your Gmail inbox.',
    iconColor: '#f28b82',
    accentColor: 'rgba(234,67,53,0.10)',
    icon: GmailIcon,
    status: 'soon',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Pull upcoming meetings, event details, and calendar notes.',
    iconColor: '#74b9ff',
    accentColor: 'rgba(26,115,232,0.10)',
    icon: CalendarIcon,
    status: 'soon',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search across docs, spreadsheets, and presentations in Drive.',
    iconColor: '#55efc4',
    accentColor: 'rgba(52,168,83,0.10)',
    icon: DriveIcon,
    status: 'soon',
  },
]

/* ── Connector card ──────────────────────────────────────── */

function ConnectorCard({ def, connected, onConnect, onDisconnect }) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft]       = useState('')

  const isSoon = def.status === 'soon'

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
    <div className={`conn2-card${connected ? ' conn2-card--connected' : ''}${isSoon ? ' conn2-card--soon' : ''}`}>
      <div className="conn2-main">
        <div className="conn2-icon" style={{ background: def.accentColor, color: def.iconColor }}>
          <def.icon size={20} />
        </div>
        <div className="conn2-info">
          <div className="conn2-name-row">
            <span className="conn2-name">{def.name}</span>
            {connected && <span className="conn2-badge">Connected</span>}
            {isSoon && <span className="conn2-soon">Soon</span>}
          </div>
          <p className="conn2-desc">{def.description}</p>
        </div>
        {!isSoon && (
          <div className="conn2-actions">
            {connected ? (
              <button type="button" className="conn2-disconnect" onClick={handleDisconnect}>
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="conn2-connect-btn"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? 'Cancel' : 'Connect'}
              </button>
            )}
          </div>
        )}
      </div>

      {!connected && expanded && (
        <form className="conn2-form" onSubmit={handleConnect}>
          {def.hint && <p className="conn2-hint">{def.hint}</p>}
          <div className="conn2-form-row">
            <input
              type="password"
              className="train-input"
              placeholder={def.placeholder}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
            <button className="src-btn-primary conn2-save-btn" type="submit" disabled={!draft.trim()}>
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/* ── Main Connectors component ───────────────────────────── */

export default function Connectors({ connections, onSave, onRemove, addSource }) {
  const connectedCount = CONNECTORS.filter(c => c.tokenKey && connections[c.tokenKey]).length

  return (
    <div className="connectors-page">

      <div className="connectors-header">
        <div className="connectors-header-text">
          <h2 className="connectors-title">Data Connectors</h2>
          <p className="connectors-sub">
            Connected apps are searched automatically on every Generate and Ask Anything query.
          </p>
        </div>
        {connectedCount > 0 && (
          <div className="connectors-count-pill">
            <span className="connectors-count-dot" />
            {connectedCount} connected
          </div>
        )}
      </div>

      <div className="connectors-grid">
        {CONNECTORS.map(def => (
          <ConnectorCard
            key={def.id}
            def={def}
            connected={!!(def.tokenKey && connections[def.tokenKey])}
            onConnect={token => onSave({ [def.tokenKey]: token })}
            onDisconnect={() => onRemove(def.tokenKey)}
          />
        ))}
      </div>

      {connections.notionToken && (
        <div className="connectors-search-section">
          <div className="connectors-search-label">
            <span>Notion Workspace Search</span>
            <span className="connectors-search-sub">Browse and add Notion pages directly to your Sources.</span>
          </div>
          <div className="connectors-search-embed">
            <NotionSearch connections={connections} addSource={addSource} />
          </div>
        </div>
      )}

    </div>
  )
}
