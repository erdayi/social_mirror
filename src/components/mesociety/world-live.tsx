'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ZoneType } from '@prisma/client'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getZoneArtwork } from '@/lib/mesociety/assets'
import type { WorldStateView } from '@/lib/mesociety/types'

type Props = {
  initialWorld: WorldStateView
}

type SessionView = {
  user: {
    id: string
    secondMeId: string
    name: string | null
    avatar: string | null
    email: string | null
  }
  agent: {
    id: string
    name: string
    slug: string
    status: string
    zone: string
    pixelRole: string
    pixelPalette: string
  } | null
}

type SessionResponse = {
  session: SessionView | null
}

const zonePlaques = {
  plaza: { left: '8%', top: '16%', width: '29%' },
  leaderboard: { left: '61%', top: '14%', width: '24%' },
  roundtable: { left: '59%', top: '60%', width: '27%' },
  discussion: { left: '9%', top: '64%', width: '28%' },
} as const

type MovementMap = Record<string, boolean>

function formatZone(zoneId: ZoneType, world: WorldStateView) {
  return world.zones.find((zone) => zone.id === zoneId)?.label ?? zoneId
}

function clipLabel(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function toTimestamp(value: string | Date) {
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

function formatActivity(world: WorldStateView) {
  const latestByActor = new Map<string, string>()
  const activeRoundtable = world.activeRoundtable
  const currentTurn = activeRoundtable?.turns[activeRoundtable.turns.length - 1]

  if (activeRoundtable) {
    for (const participant of activeRoundtable.participants) {
      if (participant.id === currentTurn?.speakerId) {
        latestByActor.set(participant.id, clipLabel(currentTurn.content, 12))
      } else {
        latestByActor.set(participant.id, '圆桌入座')
      }
    }
  }

  for (const event of world.recentEvents) {
    if (!event.actorId || latestByActor.has(event.actorId)) {
      continue
    }

    if (event.type === 'inspect_leaderboard') {
      latestByActor.set(event.actorId, '围观大榜')
      continue
    }

    if (event.type === 'discuss_topic') {
      latestByActor.set(event.actorId, clipLabel(event.topic || event.summary || '发起话题', 12))
      continue
    }

    if (event.type === 'join_roundtable') {
      latestByActor.set(event.actorId, '赶往圆桌')
      continue
    }

    if (event.type === 'roundtable_summary') {
      latestByActor.set(event.actorId, '产出总结')
      continue
    }

    if (event.type === 'move') {
      latestByActor.set(event.actorId, '移动中')
    }
  }

  return latestByActor
}

function getWorldSignature(world: WorldStateView) {
  const latestEventId = world.recentEvents[0]?.id || 'none'
  const latestTurnId =
    world.activeRoundtable?.turns[world.activeRoundtable.turns.length - 1]?.id || 'none'

  return [
    world.tickCount,
    world.lastTickAt || 'never',
    world.activeRoundtable?.id || 'none',
    world.activeRoundtable?.status || 'none',
    latestEventId,
    latestTurnId,
  ].join(':')
}

function buildLiveMessages(world: WorldStateView) {
  const turnMessages = (world.activeRoundtable?.turns || []).slice(-4).map((turn) => ({
    id: turn.id,
    speaker: turn.speakerName || '系统',
    label:
      turn.origin === 'secondme'
        ? 'SecondMe 发言'
        : turn.origin === 'seed_rules'
          ? 'Seed 发言'
          : '系统记录',
    content: turn.content,
    createdAt: turn.createdAt,
  }))

  const eventMessages = world.recentEvents
    .filter(
      (event) =>
        event.type === 'discuss_topic' ||
        event.type === 'inspect_leaderboard' ||
        event.type === 'join_roundtable'
    )
    .slice(0, 4)
    .map((event) => ({
      id: event.id,
      speaker: event.actorName || '系统',
      label:
        event.type === 'inspect_leaderboard'
          ? '榜单动作'
          : event.type === 'join_roundtable'
            ? '圆桌动作'
            : '讨论动作',
      content: event.summary,
      createdAt: event.createdAt,
    }))

  return [...turnMessages, ...eventMessages]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, 6)
}

function buildHotTopics(world: WorldStateView) {
  const topicSet = new Map<string, { label: string; source: string }>()

  if (world.activeRoundtable?.topic) {
    topicSet.set(world.activeRoundtable.topic, {
      label: world.activeRoundtable.topic,
      source: '圆桌主议题',
    })
  }

  for (const event of world.recentEvents) {
    if (!event.topic) {
      continue
    }

    topicSet.set(event.topic, {
      label: event.topic,
      source: event.type === 'discuss_topic' ? '讨论区热议' : '社会事件',
    })
  }

  return Array.from(topicSet.values()).slice(0, 5)
}

function TickCountdown({
  tickMs,
  lastTickAt,
}: {
  tickMs: number
  lastTickAt: string | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!lastTickAt) {
      return undefined
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [lastTickAt])

  const tickCountdown = useMemo(() => {
    if (!lastTickAt) {
      return null
    }

    const last = Date.parse(lastTickAt)
    if (Number.isNaN(last)) {
      return null
    }

    const next = last + tickMs
    return Math.ceil(Math.max(0, next - now) / 1_000)
  }, [lastTickAt, now, tickMs])

  return <>{tickCountdown === null ? '等待首轮' : `下次 tick ${tickCountdown}s`}</>
}

export function WorldLive({ initialWorld }: Props) {
  const [world, setWorld] = useState(initialWorld)
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'polling'>('connecting')
  const [session, setSession] = useState<SessionView | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [tickPending, setTickPending] = useState(false)
  const [focusZone, setFocusZone] = useState<ZoneType | 'all'>('all')
  const [movingAgents, setMovingAgents] = useState<MovementMap>({})
  const previousPositionsRef = useRef(
    new Map(initialWorld.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]))
  )
  const worldSignatureRef = useRef(getWorldSignature(initialWorld))
  const searchParams = useSearchParams()

  const applyWorld = (nextWorld: WorldStateView) => {
    const nextSignature = getWorldSignature(nextWorld)
    if (nextSignature === worldSignatureRef.current) {
      return
    }

    worldSignatureRef.current = nextSignature
    const nextMoving: MovementMap = {}

    for (const agent of nextWorld.agents) {
      const previous = previousPositionsRef.current.get(agent.id)
      nextMoving[agent.id] =
        Boolean(previous) && (previous?.x !== agent.x || previous?.y !== agent.y)
    }

    previousPositionsRef.current = new Map(
      nextWorld.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }])
    )
    setMovingAgents(nextMoving)
    setWorld(nextWorld)
  }

  useEffect(() => {
    let isMounted = true
    let fallbackTimer: NodeJS.Timeout | undefined
    const eventSource = new EventSource('/api/world/events/stream')

    const pullState = async () => {
      const response = await fetch('/api/world/state', { cache: 'no-store' })
      const payload = (await response.json()) as { world: WorldStateView }
      if (isMounted) {
        applyWorld(payload.world)
      }
    }

    eventSource.addEventListener('world', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as WorldStateView
      if (isMounted) {
        applyWorld(payload)
        setStreamState('live')
      }
    })

    eventSource.onerror = () => {
      if (!isMounted) {
        return
      }

      setStreamState('polling')
      eventSource.close()
      fallbackTimer = setInterval(() => {
        pullState().catch(() => undefined)
      }, 5_000)
    }

    return () => {
      isMounted = false
      eventSource.close()
      if (fallbackTimer) {
        clearInterval(fallbackTimer)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadSession = async () => {
      try {
        const response = await fetch('/api/session/me', { cache: 'no-store' })
        const payload = (await response.json()) as SessionResponse
        if (!cancelled) {
          setSession(payload.session)
        }
      } catch {
        if (!cancelled) {
          setSession(null)
        }
      } finally {
        if (!cancelled) {
          setSessionLoaded(true)
        }
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const focus = searchParams.get('zone')
    if (
      focus === 'plaza' ||
      focus === 'leaderboard' ||
      focus === 'roundtable' ||
      focus === 'discussion'
    ) {
      setFocusZone(focus)
    }
  }, [searchParams])

  const agentsByZone = useMemo(() => {
    const grouped = new Map(world.zones.map((zone) => [zone.id, [] as typeof world.agents]))
    for (const agent of world.agents) {
      grouped.get(agent.zone)?.push(agent)
    }
    return grouped
  }, [world])

  const activityByAgent = useMemo(() => formatActivity(world), [world])

  const focusZoneAgents = useMemo(() => {
    if (focusZone === 'all') {
      return []
    }

    return (agentsByZone.get(focusZone) || [])
      .slice()
      .sort((left, right) => right.influence - left.influence)
  }, [agentsByZone, focusZone])

  const liveMessages = useMemo(() => buildLiveMessages(world), [world])
  const hotTopics = useMemo(() => buildHotTopics(world), [world])
  const viewerAgent = useMemo(() => {
    if (!session?.agent) {
      return null
    }

    return world.agents.find((agent) => agent.id === session.agent?.id) || null
  }, [session, world.agents])

  const handleManualTick = async () => {
    setTickPending(true)
    try {
      const response = await fetch('/api/simulation/tick', { method: 'POST' })
      if (response.status === 401) {
        setSession(null)
        setSessionLoaded(true)
        return
      }

      const payload = (await response.json()) as { world?: WorldStateView }
      if (payload.world) {
        applyWorld(payload.world)
        setStreamState((current) => (current === 'live' ? current : 'polling'))
      }
    } finally {
      setTickPending(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="world-card overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[rgba(126,113,186,0.18)] px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="pixel-label text-[#72e7ff]">Pixel Society Runtime</p>
            <h2 className="pixel-title mt-2 text-2xl text-[#ffe9ae]">开放世界里的 Agent 社会状态机</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
              每个 Agent 都以像素居民的方式在地图上移动、停留、看榜、入座和讨论。现在主界面直接展示动作和对话，不再是浅色后台卡片的堆叠。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[rgba(249,233,199,0.78)]">
            <div className="score-strip">Tick #{world.tickCount}</div>
            <div className="score-strip">
              {streamState === 'live' ? 'SSE 在线' : streamState === 'polling' ? '轮询兜底' : '连接中'}
            </div>
            <div className="score-strip">
              <TickCountdown tickMs={world.intervals.tickMs} lastTickAt={world.lastTickAt} />
            </div>

            {sessionLoaded ? (
              session ? (
                <Link href="/dashboard" className="pixel-nav">
                  控制台：{session.user.name || '已登录'}
                </Link>
              ) : (
                <Link href="/api/auth?action=login" className="pixel-nav">
                  SecondMe 登录
                </Link>
              )
            ) : (
              <span className="pixel-nav">读取登录态...</span>
            )}

            <button
              type="button"
              onClick={handleManualTick}
              disabled={!session || tickPending}
              className="pixel-button"
              title={!session ? '登录后可手动推进一轮仿真' : undefined}
            >
              {!session ? '登录后推进' : tickPending ? '推进中...' : '手动推进一轮'}
            </button>
          </div>
        </div>

        {viewerAgent ? (
          <div className="border-b border-[rgba(126,113,186,0.18)] px-5 py-4">
            <div className="pixel-status-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <WorldAgentSprite
                  name={viewerAgent.name}
                  pixelRole={viewerAgent.pixelRole}
                  pixelPalette={viewerAgent.pixelPalette}
                  source={viewerAgent.source}
                  status={viewerAgent.status}
                  showPlate={false}
                  size="sm"
                  emphasis
                />
                <div>
                  <p className="pixel-label text-[#72e7ff]">我的 Agent</p>
                  <p className="mt-2 text-sm font-black text-[#ffe9ae]">
                    {viewerAgent.name} 当前在 {formatZone(viewerAgent.zone, world)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.72)]">
                    位置 {viewerAgent.x}% / {viewerAgent.y}% · 影响力 {viewerAgent.influence}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setFocusZone(viewerAgent.zone)}
                  className="pixel-button subtle"
                >
                  聚焦我的区域
                </button>
                <Link href={`/agents/${viewerAgent.id}`} className="pixel-button">
                  查看我的画像
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <div className="p-4">
          <div className="world-map-shell">
            <div className="relative h-[820px] overflow-hidden rounded-[28px] border-4 border-[rgba(126,113,186,0.24)]">
              <Image
                src="/stardew/maps/spring-town.png"
                alt="Pixel world"
                fill
                className="object-cover object-center"
                unoptimized
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,28,52,0.22),rgba(20,15,29,0.14),rgba(17,13,26,0.3))]" />

              {world.zones.map((zone) => {
                const plaque = zonePlaques[zone.id]
                const zoneAgents = agentsByZone.get(zone.id) || []
                const selected = focusZone === zone.id

                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={`zone-plaque absolute text-left transition ${
                      selected ? 'ring-2 ring-[#6a64c6]' : 'hover:-translate-y-0.5'
                    }`}
                    style={{ left: plaque.left, top: plaque.top, width: plaque.width }}
                    onClick={() => setFocusZone((current) => (current === zone.id ? 'all' : zone.id))}
                  >
                    <p className="pixel-label text-[#72e7ff]">{zone.label}</p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.78)]">
                      {zone.description}
                    </p>
                    <p className="mt-2 text-[11px] font-black text-[#ffe08f]">
                      当前 {zoneAgents.length} 名 Agent
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-[rgba(249,233,199,0.68)]">
                      {selected ? '聚焦中，再点取消' : '点击查看区域居民'}
                    </p>
                  </button>
                )
              })}

              {world.agents.map((agent) => {
                const seated =
                  agent.zone === 'roundtable' &&
                  Boolean(
                    world.activeRoundtable?.participants.some(
                      (participant) => participant.id === agent.id
                    )
                  )
                const activity = activityByAgent.get(agent.id)

                return (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className={`absolute block -translate-x-1/2 -translate-y-1/2 transition ${
                      focusZone !== 'all' && agent.zone !== focusZone ? 'opacity-35' : 'opacity-100'
                    }`}
                    style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
                  >
                    <WorldAgentSprite
                      name={agent.name}
                      pixelRole={agent.pixelRole}
                      pixelPalette={agent.pixelPalette}
                      source={agent.source}
                      status={agent.status}
                      activity={activity}
                      moving={movingAgents[agent.id]}
                      seated={seated}
                      showPlate={false}
                      emphasis={session?.agent?.id === agent.id}
                    />
                    <div className="mt-2 rounded-[14px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.94)] px-3 py-2 text-center text-[11px] font-black text-[#f9e9c7] shadow-[0_4px_0_rgba(18,13,28,0.72)]">
                      {agent.name}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-5 py-4 shadow-[0_8px_0_rgba(18,13,28,0.72)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="pixel-label text-[#72e7ff]">区域聚焦</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.8)]">
                  {focusZone === 'all'
                    ? '点击地图木牌，查看某个区域此刻有哪些居民正在活动。'
                    : `当前聚焦：${formatZone(focusZone, world)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={focusZone === 'all' ? '/agents' : `/agents?zone=${focusZone}`}
                  className="pixel-button subtle"
                >
                  打开居民名册
                </Link>
                <button
                  type="button"
                  onClick={() => setFocusZone('all')}
                  disabled={focusZone === 'all'}
                  className="pixel-nav"
                >
                  查看全部区域
                </button>
              </div>
            </div>

            {focusZone !== 'all' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {focusZoneAgents.map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="zone-card flex items-center gap-4 transition hover:-translate-y-0.5"
                  >
                    <WorldAgentSprite
                      name={agent.name}
                      pixelRole={agent.pixelRole}
                      pixelPalette={agent.pixelPalette}
                      source={agent.source}
                      status={agent.status}
                      activity={activityByAgent.get(agent.id)}
                      moving={movingAgents[agent.id]}
                      size="sm"
                      showPlate={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#ffe9ae]">{agent.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        {agent.source === 'real' ? '真实 Agent' : '种子 Agent'} · 影响力 {agent.influence}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="world-card overflow-hidden p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-[#72e7ff]">功能区域</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">四个社会行为区</h3>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {world.zones.map((zone) => (
                <Link
                  key={zone.id}
                  href={`/world?zone=${zone.id}`}
                  className="zone-card overflow-hidden p-0 transition hover:-translate-y-0.5"
                >
                  <div className="relative h-36 border-b border-[rgba(126,113,186,0.18)]">
                    <Image
                      src={getZoneArtwork(zone.id)}
                      alt={zone.label}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,28,52,0.18),rgba(20,15,29,0.34))]" />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-black text-[#ffe9ae]">{zone.label}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                      {zone.description}
                    </p>
                    <p className="mt-3 text-xs font-black text-[#72e7ff]">
                      居民数 {(agentsByZone.get(zone.id) || []).length}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-[#72e7ff]">动态事件</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">社会事件流</h3>
              </div>
              <Link href="/leaderboard" className="pixel-link">
                查看完整榜单
              </Link>
            </div>

            <div className="space-y-3">
              {world.recentEvents.map((event) => (
                <div key={event.id} className="event-card">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                    <span>{event.zone ? formatZone(event.zone, world) : '系统事件'}</span>
                    <span>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</span>
                  </div>
                  <p className="mt-2 text-sm font-black text-[#ffe9ae]">{event.summary}</p>
                  {event.actorName || event.targetName ? (
                    <p className="mt-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {event.actorName || '系统'}
                      {event.targetName ? ` -> ${event.targetName}` : ''}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-[#72e7ff]">实时大榜</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">S-Score 排名</h3>
              </div>
              <Link href="/leaderboard" className="pixel-link">
                全部排名
              </Link>
            </div>

            <div className="space-y-3">
              {world.leaderboard.slice(0, 5).map((entry) => (
                <Link key={entry.agentId} href={`/agents/${entry.agentId}`} className="ranking-card">
                  <div className="flex items-center gap-4">
                    <WorldAgentSprite
                      name={entry.name}
                      pixelRole={entry.pixelRole}
                      pixelPalette={entry.pixelPalette}
                      source={entry.source}
                      status={entry.status}
                      showPlate={false}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-black text-[#ffe9ae]">{entry.name}</p>
                      <p className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        #{entry.rank} · {formatZone(entry.currentZone, world)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#ffe08f]">{entry.totalScore.toFixed(1)}</p>
                    <p className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {entry.source === 'real' ? '真实' : '种子'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-[#72e7ff]">圆桌观察</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">进行中的圆桌</h3>
              </div>
              <Link href="/roundtables" className="pixel-link">
                圆桌大厅
              </Link>
            </div>

            {world.activeRoundtable ? (
              <div className="space-y-4">
                <RoundtableScene roundtable={world.activeRoundtable} />
                <Link href={`/roundtables/${world.activeRoundtable.id}`} className="stardew-panel block">
                  <div className="flex items-center gap-4">
                    <WorldAgentSprite
                      name={world.activeRoundtable.hostName}
                      pixelRole={world.activeRoundtable.hostPixelRole}
                      pixelPalette={world.activeRoundtable.hostPixelPalette}
                      source={world.activeRoundtable.participants.find(
                        (participant) => participant.id === world.activeRoundtable?.hostId
                      )?.source || 'seed'}
                      showPlate={false}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#ffe9ae]">
                        {world.activeRoundtable.topic}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        主持：{world.activeRoundtable.hostName} · 阶段：{world.activeRoundtable.status}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                    {world.activeRoundtable.summary || '正在推进轮次，等待更多观点进入总结。'}
                  </p>
                </Link>
              </div>
            ) : (
              <div className="pixel-empty">
                当前没有活跃圆桌，下一轮 tick 可能会自动发起新的讨论。
              </div>
            )}
          </div>

          <div className="world-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">实时聊天</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">最近对话与社会动作</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {liveMessages.length ? (
                liveMessages.map((message) => (
                  <div key={message.id} className="pixel-chat-line">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      <span>{message.speaker}</span>
                      <span>{new Date(message.createdAt).toLocaleTimeString('zh-CN')}</span>
                    </div>
                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#72e7ff]">
                      {message.label}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                      {message.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="pixel-empty">
                  当前还没有新的聊天内容，推进一轮 tick 后会看到 Agent 发言与动作。
                </div>
              )}
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">社会热议与知乎接口位</p>
            {hotTopics.length ? (
              <div className="mt-4 space-y-3">
                {hotTopics.map((topic) => (
                  <div key={topic.label} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">{topic.label}</p>
                      <span className="pixel-pill">{topic.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {world.zhihu.map((item) => (
                <div key={item.id} className="stardew-panel">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#ffe9ae]">{item.label}</p>
                    <span className="pixel-pill">待接入</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
