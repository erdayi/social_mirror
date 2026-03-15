'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function TickButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const handleTick = async () => {
    setPending(true)
    try {
      await fetch('/api/simulation/tick', {
        method: 'POST',
      })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleTick}
      disabled={pending}
      className="pixel-button"
    >
      {pending ? '推进中...' : '手动推进一轮'}
    </button>
  )
}
