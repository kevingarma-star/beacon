import { useState } from 'react'
import './Training.css'

/* ── Score ring ─────────────────────────────────────────── */

function ScoreRing({ score }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <svg className="score-ring" width="130" height="130" viewBox="0 0 130 130" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F25A54" />
          <stop offset="100%" stopColor="#27AE60" />
        </linearGradient>
      </defs>
      <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(203,238,255,.08)" strokeWidth="9" />
      <circle
        cx="65" cy="65" r={r} fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dasharray .7s cubic-bezier(.4,0,.2,1)' }}
      />
      <text
        x="65" y="65"
        textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize="26" fontWeight="800"
        fontFamily="'Sora', sans-serif"
      >
        {score}
      </text>
    </svg>
  )
}

/* ── Trait slider ───────────────────────────────────────── */

function Trait({ label, value, onChange }) {
  const pct = `${value}%`
  return (
    <div className="trait">
      <div className="trait-row">
        <span className="trait-label">{label}</span>
        <span className="trait-val">{value}</span>
      </div>
      <input
        type="range" min="0" max="100" value={value}
        className="trait-slider"
        style={{ '--pct': pct }}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/* ── Example card ───────────────────────────────────────── */

function ExampleCard({ example, onRemove }) {
  return (
    <div className="ex-card">
      <div className="ex-card-body">
        <p className="ex-concern">{example.concern}</p>
        <p className="ex-response">{example.response}</p>
      </div>
      <button
        className="ex-remove"
        type="button"
        onClick={() => onRemove(example.id)}
        aria-label="Remove example"
      >
        &#x2715;
      </button>
    </div>
  )
}

/* ── Empty state icon ───────────────────────────────────── */

function EmptyIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect width="44" height="44" rx="13" fill="rgba(242,90,84,.08)" />
      <path
        d="M22 9 L23.8 18.2 L32 20 L23.8 21.8 L22 31 L20.2 21.8 L12 20 L20.2 18.2 Z"
        fill="#F25A54" opacity=".85"
      />
      <circle cx="31" cy="12" r="1.8" fill="#CBEEFF" opacity=".55" />
      <circle cx="13" cy="31" r="1.2" fill="#CBEEFF" opacity=".35" />
    </svg>
  )
}

/* ── Main component ─────────────────────────────────────── */

export default function Training({ data, update, addExample, removeExample, score }) {
  const [adding, setAdding] = useState(false)
  const [draftConcern, setDraftConcern] = useState('')
  const [draftResponse, setDraftResponse] = useState('')

  const scoreLabel =
    score >= 80 ? 'Excellent' :
    score >= 50 ? 'Good' :
    score >= 20 ? 'Getting started' :
    'Not configured'

  function handleAdd(e) {
    e.preventDefault()
    if (!draftConcern.trim() || !draftResponse.trim()) return
    addExample(draftConcern.trim(), draftResponse.trim())
    setDraftConcern('')
    setDraftResponse('')
    setAdding(false)
  }

  const personaPts = data.instructions.trim().length > 20 ? 30 : data.instructions.trim().length > 0 ? 10 : 0
  const examplePts = Math.min(data.examples.length * 7, 70)

  return (
    <div className="train-page">

      {/* ── Score banner ── */}
      <div className="score-banner">
        <ScoreRing score={score} />
        <div className="score-info">
          <div className="score-label-row">
            <span className="score-big">{scoreLabel}</span>
            <span className="score-sub">{score} / 100 training score</span>
          </div>
          <div className="score-bar-wrap">
            <div className="score-bar" style={{ width: `${score}%` }} />
          </div>
          <div className="score-chips">
            <span className={`score-chip ${personaPts >= 30 ? 'chip-green' : 'chip-dim'}`}>
              Persona &middot; {personaPts} / 30 pts
            </span>
            <span className={`score-chip ${examplePts > 0 ? 'chip-coral' : 'chip-dim'}`}>
              Examples &middot; {examplePts} / 70 pts &nbsp;({data.examples.length} / 10)
            </span>
          </div>
          <p className="score-hint">
            Add core instructions and example response pairs to improve generation quality.
          </p>
        </div>
      </div>

      <div className="train-grid">

        {/* ── Persona panel ── */}
        <div className="train-panel">
          <div className="train-panel-head">
            <span className="train-panel-title">Agent Persona</span>
            <span className="train-pill">Identity</span>
          </div>

          <div className="train-field">
            <label className="train-label" htmlFor="t-name">Agent Name</label>
            <input
              id="t-name"
              className="train-input"
              placeholder="e.g. Beacon, Aria, Support AI…"
              value={data.agentName}
              onChange={e => update({ agentName: e.target.value })}
            />
          </div>

          <div className="train-field">
            <label className="train-label" htmlFor="t-instructions">Core Instructions</label>
            <textarea
              id="t-instructions"
              className="train-textarea"
              rows={6}
              placeholder="Describe your company, products, support policies, and what the agent should always or never say…"
              value={data.instructions}
              onChange={e => update({ instructions: e.target.value })}
            />
          </div>

          <div className="train-field">
            <label className="train-label">Personality Traits</label>
            <div className="traits-list">
              <Trait
                label="Empathy"
                value={data.traits.empathy}
                onChange={v => update(p => ({ ...p, traits: { ...p.traits, empathy: v } }))}
              />
              <Trait
                label="Formality"
                value={data.traits.formality}
                onChange={v => update(p => ({ ...p, traits: { ...p.traits, formality: v } }))}
              />
              <Trait
                label="Response Length"
                value={data.traits.length}
                onChange={v => update(p => ({ ...p, traits: { ...p.traits, length: v } }))}
              />
            </div>
          </div>
        </div>

        {/* ── Examples panel ── */}
        <div className="train-panel">
          <div className="train-panel-head">
            <span className="train-panel-title">Example Library</span>
            <button
              className={`add-ex-btn${adding ? ' add-ex-btn--cancel' : ''}`}
              type="button"
              onClick={() => setAdding(a => !a)}
            >
              {adding ? '✕ Cancel' : '+ Add Example'}
            </button>
          </div>

          {adding && (
            <form className="add-ex-form" onSubmit={handleAdd}>
              <div className="train-field">
                <label className="train-label">Customer Concern</label>
                <textarea
                  className="train-textarea"
                  rows={3}
                  placeholder="Paste an example customer message…"
                  value={draftConcern}
                  onChange={e => setDraftConcern(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="train-field">
                <label className="train-label">Ideal Response</label>
                <textarea
                  className="train-textarea"
                  rows={4}
                  placeholder="Write the ideal response to this concern…"
                  value={draftResponse}
                  onChange={e => setDraftResponse(e.target.value)}
                />
              </div>
              <button
                className="save-ex-btn"
                type="submit"
                disabled={!draftConcern.trim() || !draftResponse.trim()}
              >
                Save Example
              </button>
            </form>
          )}

          {data.examples.length === 0 && !adding && (
            <div className="ex-empty">
              <EmptyIcon />
              <p className="ex-empty-title">No examples yet</p>
              <p className="ex-empty-sub">
                Add them manually, or generate a response in the Generate tab and click&nbsp;
                <strong>Save as Example</strong>.
              </p>
            </div>
          )}

          {data.examples.length > 0 && (
            <div className="ex-list">
              {data.examples.map(ex => (
                <ExampleCard key={ex.id} example={ex} onRemove={removeExample} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
