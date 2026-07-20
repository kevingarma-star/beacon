import { useEffect, useRef } from 'react'

export default function Chat({ messages, loading, error, onSend, onClear }) {
  const windowRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (windowRef.current) {
      windowRef.current.scrollTop = windowRef.current.scrollHeight
    }
  }, [messages, loading])

  function handleSubmit(e) {
    e.preventDefault()
    const val = inputRef.current?.value?.trim()
    if (!val || loading) return
    onSend(val)
    inputRef.current.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="chat">
      <div className="response-top">
        <span className="field-label">Chat</span>
        {messages.length > 0 && (
          <button className="save-btn" type="button" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-window" ref={windowRef}>
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            Paste the customer's message or describe the situation — I'll help you craft a reply.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-bubble chat-bubble--loading">
              <span className="spinner" />
            </div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Paste the customer's message, or ask for a revision…"
          rows={2}
          disabled={loading}
          onKeyDown={handleKeyDown}
        />
        <button className="chat-send" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Send'}
        </button>
      </form>
    </div>
  )
}
