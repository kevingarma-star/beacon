import { useState } from 'react'

const KEY = 'beacon-connections-v1'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {} } catch { return {} }
}

export function useConnections() {
  const [connections, setConnections] = useState(load)

  function saveConnection(patch) {
    setConnections(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  function removeConnection(key) {
    setConnections(prev => {
      const next = { ...prev }
      delete next[key]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }

  return { connections, saveConnection, removeConnection }
}
