'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
import { RoundtablesHub } from '@/components/mesociety/roundtables-hub'
import type { RoundtableSummary, WorldEventView, WorldStateView } from '@/lib/mesociety/types'

type Props = {
  initialWorld: WorldStateView
  initialRoundtables: RoundtableSummary[]
}

type LiveState = 'live' | 'polling' | 'syncing'

const LIVE_EVENT_TYPES = new Set([
  'join_roundtable',
  'roundtable_summary',
  'discuss_topic',
  'follow',
  'trust',
  'cooperate',
  'alliance',
  'reject',
])

function pickFocusEvents(events: WorldEventView[]) {
  return events.filter((event) => LIVE_EVENT_TYPES.has(event.type)).slice(0, 6)
}

function formatTime(value: number | null) {
  if (!value) {
    return '刚刚'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

export function RoundtablesHubLive({ initialWorld, initialRoundtables }: Props) {
  const initialFocusEvents = pickFocusEvents(initialWorld.recentEvents)
  const [world, setWorld] = useState(initialWorld)
  const [roundtables, setRoundtables] = useState(initialRoundtables)
  const [focusEvents, setFocusEvents] = useState<WorldEventView[]>(initialFocusEvents)
  const [liveState, setLiveState] = useState<LiveState>('live')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [highlightedEventIds, setHighlightedEventIds] = useState<string[]>([])
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const worldRef = useRef(initialWorld)
  const focusEventsRef = useRef<WorldEventView[]>(initialFocusEvents)

  useEffect(() => {
    let closed = false
    let eventSource: EventSource | null = null

    setLastUpdatedAt(Date.now())

    const clearPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }

    const syncFocusEvents = (nextWorld: WorldStateView) => {
      const nextFocusEvents = pickFocusEvents(nextWorld.recentEvents)
      const previousIds = new Set(focusEventsRef.current.map((event) => event.id))
      const nextIds = nextFocusEvents
        .filter((event) => !previousIds.has(event.id))
        .map((event) => event.id)
        .slice(0, 3)

      startTransition(() => {
        setFocusEvents(nextFocusEvents)
      })
      focusEventsRef.current = nextFocusEvents

      if (!nextIds.length) {
        worldRef.current = nextWorld
        return
      }

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }

      setHighlightedEventIds(nextIds)
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedEventIds([])
      }, 6000)
      worldRef.current = nextWorld
    }

    const syncRoundtables = async () => {
      const response = await fetch('/api/roundtables', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to load roundtables')
      }

      const payload = (await response.json()) as { roundtables: RoundtableSummary[] }
      if (closed) {
        return
      }

      startTransition(() => {
        setRoundtables(payload.roundtables)
      })
    }

    const syncAll = async () => {
      const [worldResponse, roundtablesResponse] = await Promise.all([
        fetch('/api/world/state', { cache: 'no-store' }),
        fetch('/api/roundtables', { cache: 'no-store' }),
      ])

      if (!worldResponse.ok || !roundtablesResponse.ok) {
        throw new Error('Failed to refresh roundtables hub')
      }

      const worldPayload = (await worldResponse.json()) as { world: WorldStateView }
      const roundtablesPayload = (await roundtablesResponse.json()) as { roundtables: RoundtableSummary[] }
      if (closed) {
        return
      }

      startTransition(() => {
        setWorld(worldPayload.world)
        setRoundtables(roundtablesPayload.roundtables)
      })
      syncFocusEvents(worldPayload.world)
      setLastUpdatedAt(Date.now())
    }

    const startPolling = () => {
      clearPolling()
      setLiveState('polling')
      pollingRef.current = setInterval(() => {
        setLiveState('syncing')
        void syncAll()
          .then(() => {
            if (!closed) {
              setLiveState('polling')
            }
          })
          .catch(() => {
            if (!closed) {
              setLiveState('polling')
            }
          })
      }, 15_000)
    }

    const connect = () => {
      eventSource = new EventSource('/api/world/events/stream')

      eventSource.addEventListener('world', (event) => {
        try {
          const nextWorld = JSON.parse((event as MessageEvent<string>).data) as WorldStateView
          if (closed) {
            return
          }

          clearPolling()
          setLiveState('live')
          startTransition(() => {
            setWorld(nextWorld)
          })
          syncFocusEvents(nextWorld)
          setLastUpdatedAt(Date.now())

          void syncRoundtables().catch(() => {
            if (!closed) {
              startPolling()
            }
          })
        } catch {
          if (!closed) {
            startPolling()
          }
        }
      })

      eventSource.addEventListener('error', () => {
        if (closed) {
          return
        }

        eventSource?.close()
        eventSource = null
        startPolling()
      })
    }

    connect()

    return () => {
      closed = true
      clearPolling()
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
      eventSource?.close()
    }
  }, [])

  const liveLabel =
    liveState === 'live'
      ? '实时同步中'
      : liveState === 'syncing'
        ? '正在刷新'
        : '轮询更新中'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(124,218,255,0.18)] bg-[rgba(24,34,55,0.82)] px-4 py-3 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              liveState === 'live'
                ? 'bg-[#72e7ff] shadow-[0_0_14px_rgba(114,231,255,0.75)]'
                : liveState === 'syncing'
                  ? 'bg-[#ffe08f] shadow-[0_0_14px_rgba(255,224,143,0.65)]'
                  : 'bg-[#ffb8cb] shadow-[0_0_14px_rgba(255,184,203,0.55)]'
            }`}
          />
          <span>{liveLabel}</span>
        </div>
        <span className="text-xs uppercase tracking-[0.16em] text-[rgba(249,233,199,0.56)]">
          最近更新 {formatTime(lastUpdatedAt)}
        </span>
      </div>

      <RoundtablesHub
        world={world}
        roundtables={roundtables}
        focusEvents={focusEvents}
        highlightedEventIds={highlightedEventIds}
      />
    </div>
  )
}

