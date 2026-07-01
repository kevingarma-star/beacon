import { useState } from 'react'
import './App.css'
import coverageMap from './assets/hubble-coverage-map.png'
import Training from './Training'
import Sources  from './Sources'
import { useTraining } from './useTraining'
import { useSources }  from './useSources'

const TONES = [
  { id: 'professional', label: 'Professional', desc: 'Formal and polished' },
  { id: 'empathetic',   label: 'Empathetic',   desc: 'Warm and understanding' },
  { id: 'direct',       label: 'Direct',        desc: 'Concise, no fluff' },
  { id: 'friendly',     label: 'Friendly',      desc: 'Casual and approachable' },
]

export default function App() {
  const [view, setView]             = useState('generate')
  const [concern, setConcern]       = useState('')
  const [tone, setTone]             = useState('professional')
  const [suggestion, setSuggestion] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)
  const [saved, setSaved]           = useState(false)

  const training = useTraining()
  const sources  = useSources()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!concern.trim()) return

    setLoading(true)
    setError('')
    setSuggestion('')
    setSaved(false)

    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL ?? ''
      const res = await fetch(`${workerUrl}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concern:          concern.trim(),
          tone,
          agentName:        training.data.agentName    || undefined,
          instructions:     training.data.instructions || undefined,
          traits:           training.data.traits,
          examples:         training.data.examples.slice(0, 5),
          knowledgeContext: sources.knowledgeContext   || undefined,
        }),
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

  function handleSave() {
    training.addExample(concern, suggestion)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="app">
      <div className="app-bg-map" style={{ backgroundImage: `url(${coverageMap})` }} />
      <div className="app-bg-wash" />

      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span className="app-logo-dot" />
            Beacon
          </div>
          <span className="app-header-sub">Customer Support Assistant</span>

          <nav className="app-nav">
            <button
              className={`nav-tab${view === 'generate' ? ' nav-tab--active' : ''}`}
              onClick={() => setView('generate')}
            >
              Generate
            </button>
            <button
              className={`nav-tab${view === 'train' ? ' nav-tab--active' : ''}`}
              onClick={() => setView('train')}
            >
              Train
              {training.data.examples.length > 0 && (
                <span className="nav-badge">{training.data.examples.length}</span>
              )}
            </button>
            <button
              className={`nav-tab${view === 'sources' ? ' nav-tab--active' : ''}`}
              onClick={() => setView('sources')}
            >
              Sources
              {sources.activeCount > 0 && (
                <span className="nav-badge">{sources.activeCount}</span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {view === 'train' && (
        <Training
          data={training.data}
          update={training.update}
          addExample={training.addExample}
          removeExample={training.removeExample}
          score={training.score}
        />
      )}

      {view === 'sources' && (
        <Sources
          sources={sources.sources}
          addSource={sources.addSource}
          removeSource={sources.removeSource}
          toggleSource={sources.toggleSource}
          updateSource={sources.updateSource}
          activeCount={sources.activeCount}
          totalChars={sources.totalChars}
        />
      )}

      {view === 'generate' && (
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

            {(training.data.examples.length > 0 || sources.activeCount > 0) && (
              <div className="context-badges">
                {training.data.examples.length > 0 && (
                  <div className="training-active-badge">
                    <span className="training-dot" />
                    {training.data.examples.length} training example{training.data.examples.length !== 1 ? 's' : ''}
                  </div>
                )}
                {sources.activeCount > 0 && (
                  <div className="training-active-badge">
                    <span className="training-dot" />
                    {sources.activeCount} knowledge source{sources.activeCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

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
                <div className="response-actions">
                  {saved ? (
                    <span className="saved-flash">&#10003; Saved</span>
                  ) : (
                    <button className="save-btn" type="button" onClick={handleSave}>
                      Save as Example
                    </button>
                  )}
                  <button className="copy-btn" type="button" onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
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
      )}
    </div>
  )
}
