import { useState, useEffect, useRef, useCallback } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? ''
const STALE_MS   = 24 * 60 * 60 * 1000   // auto re-sync once a day
const MAX_ROUNDS = 400                   // hard stop for runaway loops

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function post(path, body) {
  const res  = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// Keeps a per-workspace full-text index of Notion in sync.
// The worker crawls in small chunks; this hook drives the loop and reports progress.
export function useNotionSync(notionToken) {
  const [status, setStatus]     = useState(null)   // { synced, count, syncedAt, truncated } | null
  const [syncing, setSyncing]   = useState(false)
  const [progress, setProgress] = useState(null)   // { indexed, discovered, searchDone } | null
  const [error, setError]       = useState('')
  const runId = useRef(0)

  const sync = useCallback(async ({ reset = false } = {}) => {
    if (!notionToken) return
    const id = ++runId.current
    setSyncing(true)
    setError('')
    try {
      let r = await post('/notion-sync-all', { notionToken, reset })
      let rounds = 1
      while (!r.done) {
        if (runId.current !== id) return            // token changed or cancelled
        setProgress({ indexed: r.indexed, discovered: r.discovered, searchDone: r.searchDone })
        if (++rounds > MAX_ROUNDS) throw new Error('Sync is taking too long — try again later.')
        await sleep(r.retryAfter || 250)
        r = await post('/notion-sync-all', { notionToken, seq: r.seq })
      }
      if (runId.current !== id) return
      setStatus({ synced: true, count: r.count, syncedAt: r.syncedAt, truncated: r.truncated })
    } catch (err) {
      if (runId.current === id) setError(err.message)
    } finally {
      if (runId.current === id) {
        setSyncing(false)
        setProgress(null)
      }
    }
  }, [notionToken])

  const clear = useCallback(async token => {
    runId.current++
    setStatus(null)
    setSyncing(false)
    setProgress(null)
    if (token) {
      try { await post('/notion-sync-clear', { notionToken: token }) } catch { /* best effort */ }
    }
  }, [])

  // On connect / load: check the index, resume an interrupted crawl, or auto-sync if missing or stale
  useEffect(() => {
    runId.current++
    setStatus(null)
    setError('')
    if (!notionToken) return
    let cancelled = false
    post('/notion-sync-status', { notionToken })
      .then(s => {
        if (cancelled) return
        setStatus(s)
        const stale = !s.synced || !s.syncedAt || Date.now() - new Date(s.syncedAt).getTime() > STALE_MS
        if (s.inProgress || stale) sync()
      })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [notionToken, sync])

  return { status, syncing, progress, error, sync, clear }
}
