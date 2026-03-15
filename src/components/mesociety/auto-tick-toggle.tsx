'use client'

import { useEffect, useState } from 'react'

type RunnerPayload = {
  enabled: boolean
  startedAt: string | null
  intervalMs: number
  lastError: string | null
}

export function AutoTickToggle() {
  const [state, setState] = useState<RunnerPayload | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/simulation/auto', { cache: 'no-store' })
        const payload = (await response.json()) as RunnerPayload
        if (!cancelled) {
          setState(payload)
        }
      } catch {
        if (!cancelled) {
          setState(null)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async () => {
    if (pending) {
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/simulation/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !(state?.enabled ?? false) }),
      })

      if (response.status === 401) {
        setState(null)
        return
      }

      const payload = (await response.json()) as RunnerPayload
      setState(payload)
    } finally {
      setPending(false)
    }
  }

  const enabled = Boolean(state?.enabled)

  return (
    <button
      type="button"
      onClick={toggle}
      className="pixel-button subtle"
      disabled={pending}
      title="开启后，即使不打开 /world 页面，服务器也会持续尝试推进 tick（仅适用于 Node.js 长驻进程，如本地 hackathon 演示）。"
    >
      {pending ? '切换中...' : enabled ? '自动运行：开' : '自动运行：关'}
    </button>
  )
}

