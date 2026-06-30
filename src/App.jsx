import { useState } from 'react'
import './App.css'

const TONES = [
  { id: 'professional', label: 'Professional', desc: 'Formal and polished' },
  { id: 'empathetic',   label: 'Empathetic',   desc: 'Warm and understanding' },
  { id: 'direct',       label: 'Direct',        desc: 'Concise, no fluff' },
  { id: 'friendly',     label: 'Friendly',      desc: 'Casual and approachable' },
]

export default function App() {
  const [concern, setConcern]       = useState('')
  const [tone, setTone]             = useState('professional')
  const [suggestion, setSuggestion] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!concern.trim()) return

    setLoading(true)
    setError('')
    setSuggestion('')

    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL ?? ''
      const res = await fetch(`${workerUrl}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concern: concern.trim(), tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setSuggestion(data.suggestion)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(suggestion)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span className="app-logo-dot" />
            Beacon
          </div>
          <span className="app-header-sub">Customer Support Assistant</span>
        </div>
      </header>

      <main className="app-main">
        <form className="panel panel-left" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="concern">
              Customer Concern
            </label>
            <textarea
              id="concern"
              className="field-textarea"
              placeholder="Paste or type the customer's message, complaint, or question…"
              value={concern}
              onChange={e => setConcern(e.target.value)}
              rows={10}
            />
          </div>

          <div className="field">
            <label className="field-label">Response Tone</label>
            <div className="tone-grid">
              {TONES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`tone-btn${tone === t.id ? ' tone-btn--active' : ''}`}
                  onClick={() => setTone(t.id)}
                >
                  <span className="tone-btn-name">{t.label}</span>
                  <span className="tone-btn-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="submit-btn"
            type="submit"
            disabled={loading || !concern.trim()}
          >
            {loading && <span className="spinner" />}
            {loading ? 'Generating…' : 'Suggest Response'}
          </button>
        </form>

        <div className="panel panel-right">
          <div className="response-top">
            <span className="field-label">Suggested Response</span>
            {suggestion && (
              <button className="copy-btn" type="button" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>

          {error && <div className="error-box">{error}</div>}

          {!error && !suggestion && !loading && (
            <div className="empty-state">
              Your suggested response will appear here.
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <span className="spinner spinner--lg" />
            </div>
          )}

          {suggestion && (
            <div className="response-body">{suggestion}</div>
          )}
        </div>
      </main>
    </div>
  )
}
