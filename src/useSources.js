import { useState, useCallback, useMemo } from 'react'

const KEY = 'beacon-sources-v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(sources) {
  localStorage.setItem(KEY, JSON.stringify(sources))
  return sources
}

export function useSources() {
  const [sources, setSources] = useState(load)

  const addSource = useCallback(source => {
    setSources(prev =>
      persist([{ id: Date.now(), active: true, addedAt: new Date().toISOString(), ...source }, ...prev])
    )
  }, [])

  const removeSource = useCallback(id => {
    setSources(prev => persist(prev.filter(s => s.id !== id)))
  }, [])

  const toggleSource = useCallback(id => {
    setSources(prev => persist(prev.map(s => s.id === id ? { ...s, active: !s.active } : s)))
  }, [])

  const updateSource = useCallback((id, patch) => {
    setSources(prev => persist(prev.map(s => s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // Concatenate all active sources into a single context string for the API
  const knowledgeContext = useMemo(() =>
    sources
      .filter(s => s.active && s.content?.trim())
      .map(s => `### ${s.name}\n${s.content.trim()}`)
      .join('\n\n---\n\n'),
    [sources]
  )

  const activeCount = sources.filter(s => s.active && s.content).length
  const totalChars  = sources.filter(s => s.active).reduce((n, s) => n + (s.content?.length ?? 0), 0)

  return { sources, addSource, removeSource, toggleSource, updateSource, knowledgeContext, activeCount, totalChars }
}
