import { useState, useCallback, useEffect, useRef } from 'react'

const KEY         = 'beacon-training-v1'
const WORKER_URL  = import.meta.env.VITE_WORKER_URL ?? ''

const defaults = {
  agentName:    '',
  instructions: '',
  traits:       { empathy: 60, formality: 60, length: 50 },
  examples:     [],
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

function saveLocal(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

export function useTraining() {
  const [data, setData]     = useState(loadLocal)
  const [synced, setSynced] = useState(false)
  const saveTimer           = useRef(null)

  // On mount: fetch latest from the worker and merge over the local cache
  useEffect(() => {
    fetch(`${WORKER_URL}/training`)
      .then(r => r.ok ? r.json() : null)
      .then(remote => {
        if (remote) {
          const merged = { ...defaults, ...remote }
          setData(merged)
          saveLocal(merged)
        }
        setSynced(true)
      })
      .catch(() => setSynced(true)) // fall back to local if worker is unreachable
  }, [])

  // Debounced save to worker — fires 800 ms after the last change
  function persistRemote(next) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${WORKER_URL}/training`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(next),
      }).catch(() => { /* silent — local copy is still intact */ })
    }, 800)
  }

  const update = useCallback(patch => {
    setData(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      saveLocal(next)
      persistRemote(next)
      return next
    })
  }, [])

  const addExample = useCallback((concern, response) => {
    update(prev => ({
      ...prev,
      examples: [{ id: Date.now(), concern, response }, ...prev.examples],
    }))
  }, [update])

  const removeExample = useCallback(id => {
    update(prev => ({ ...prev, examples: prev.examples.filter(e => e.id !== id) }))
  }, [update])

  const score = Math.min(
    (data.instructions.trim().length > 20 ? 30 : data.instructions.trim().length > 0 ? 10 : 0) +
    Math.min(data.examples.length * 7, 70),
    100
  )

  return { data, update, addExample, removeExample, score, synced }
}
