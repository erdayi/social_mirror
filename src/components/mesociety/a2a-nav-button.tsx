'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export function A2ANavButton() {
  const [unreadCount, setUnreadCount] = useState(0)

  // 初始加载未读计数
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/a2a/messages?status=pending&limit=1')
        const data = await res.json()
        setUnreadCount(data.total || 0)
      } catch {
        // ignore
      }
    }
    fetchUnread()
  }, [])

  // SSE 实时更新
  useEffect(() => {
    let eventSource: EventSource | null = null

    const connect = () => {
      eventSource = new EventSource('/api/a2a/stream')
      eventSource.onerror = () => {
        eventSource?.close()
        setTimeout(connect, 5000)
      }
      eventSource.addEventListener('unread_count', (e) => {
        const data = JSON.parse(e.data)
        setUnreadCount(data.unreadCount || 0)
      })
      eventSource.addEventListener('new_messages', () => {
        fetchUnread()
      })
    }

    connect()

    return () => eventSource?.close()
  }, [])

  const fetchUnread = async () => {
    try {
      const res = await fetch('/api/a2a/messages?status=pending&limit=1')
      const data = await res.json()
      setUnreadCount(data.total || 0)
    } catch {
      // ignore
    }
  }

  return (
    <Link href="/messages" className="pixel-nav a2a-nav-link">
      <span className="a2a-nav-label">消息</span>
      {unreadCount > 0 && (
        <span className="a2a-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </Link>
  )
}
