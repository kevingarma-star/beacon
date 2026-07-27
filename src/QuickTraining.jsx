import { useState } from 'react'

function ExampleRow({ example, onRemove }) {
  return (
    <div className="qt-row">
      <div className="qt-row-body">
        <p className="qt-q">{example.concern}</p>
        <p className="qt-a">{example.response}</p>
      </div>
      <button
        type="button"
        className="qt-remove"
        onClick={() => onRemove(example.id)}
        aria-label="Remove example"
      >
        &#x2715;
      </button>
    </div>
  )
}

export default function QuickTraining({ examples, addExample, removeExample }) {
  const [open, setOpen]               = useState(false)
  const [adding, setAdding]           = useState(false)
  const [draftQ, setDraftQ]           = useState('')
  const [draftA, setDraftA]           = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!draftQ.trim() || !draftA.trim()) return
    addExample(draftQ.trim(), draftA.trim())
    setDraftQ('')
    setDraftA('')
    setAdding(false)
  }

  function handleCancel() {
    setDraftQ('')
    setDraftA('')
    setAdding(false)
  }

  return (
    <div className={`qt-wrap${open ? ' qt-wrap--open' : ''}`}>

      {/* Toggle row */}
      <button type="button" className="qt-toggle" onClick={() => setOpen(v => !v)}>
        <span className="qt-toggle-left">
          <svg className="qt-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Training Examples
          {examples.length > 0 && (
            <span className="qt-count">{examples.length}</span>
          )}
        </span>
        <svg
          className={`qt-chevron${open ? ' qt-chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="qt-body">

          {/* Example list */}
          {examples.length > 0 && (
            <div className="qt-list">
              {examples.map(ex => (
                <ExampleRow key={ex.id} example={ex} onRemove={removeExample} />
              ))}
            </div>
          )}

          {/* Add form */}
          {adding ? (
            <form className="qt-form" onSubmit={handleAdd}>
              <div className="qt-field">
                <label className="qt-label">Question / Concern</label>
                <textarea
                  className="qt-textarea"
                  rows={2}
                  placeholder="Example customer message or question…"
                  value={draftQ}
                  onChange={e => setDraftQ(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="qt-field">
                <label className="qt-label">Ideal Response</label>
                <textarea
                  className="qt-textarea"
                  rows={3}
                  placeholder="How should the agent respond…"
                  value={draftA}
                  onChange={e => setDraftA(e.target.value)}
                />
              </div>
              <div className="qt-form-actions">
                <button type="button" className="qt-cancel" onClick={handleCancel}>Cancel</button>
                <button
                  type="submit"
                  className="qt-save"
                  disabled={!draftQ.trim() || !draftA.trim()}
                >
                  Save Example
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="qt-add-btn"
              onClick={() => setAdding(true)}
            >
              + Add Example
            </button>
          )}
        </div>
      )}
    </div>
  )
}
