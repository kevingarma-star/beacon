import { useState, useCallback } from 'react'

const KEY = 'beacon-training-v1'

const defaults = {
  agentName: '',
  instructions: '',
  traits: { empathy: 60, formality: 60, length: 50 },
  examples: [],
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

export function useTraining() {
  const [data, setData] = useState(load)

  const update = useCallback(patch => {
    setData(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      localStorage.setItem(KEY, JSON.stringify(next))
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

  // Persona worth up to 30pts, each example worth 7pts (max 10 examples = 70pts)
  const score = Math.min(
    (data.instructions.trim().length > 20 ? 30 : data.instructions.trim().length > 0 ? 10 : 0) +
    Math.min(data.examples.length * 7, 70),
    100
  )

  return { data, update, addExample, removeExample, score }
}
