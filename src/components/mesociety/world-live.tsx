'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ZoneType } from '@prisma/client'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
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
  plaza: { left: '8%', top: '20%', width: '28%' },
  leaderboard: { left: '61%', top: '16%', width: '24%' },
  roundtable: { left: '60%', top: '62%', width: '25%' },
  discussion: { left: '10%', top: '65%', width: '26%' },
} as const

export function WorldLive({ initialWorld }: Props) {
  const [world, setWorld] = useState(initialWorld)
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'polling'>('connecting')
  const [session, setSession] = useState<SessionView | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [tickPending, setTickPending] = useState(false)
  const [focusZone, setFocusZone] = useState<ZoneType | 'all'>('all')
  const [now, setNow] = useState(() => Date.now())
  const searchParams = useSearchParams()

  useEffect(() => {
    let isMounted = true
    let fallbackTimer: NodeJS.Timeout | undefined
    const eventSource = new EventSource('/api/world/events/stream')

    const pullState = async () => {
      const response = await fetch('/api/world/state', { cache: 'no-store' })
      const payload = (await response.json()) as { world: WorldStateView }
      if (isMounted) {
        setWorld(payload.world)
      }
    }

    eventSource.addEventListener('world', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as WorldStateView
      if (isMounted) {
        setWorld(payload)
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
    if (!focus) {
      return
    }

    if (focus === 'plaza' || focus === 'leaderboard' || focus === 'roundtable' || focus === 'discussion') {
      setFocusZone(focus)
    }
  }, [searchParams])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  const agentsByZone = useMemo(() => {
    const grouped = new Map(world.zones.map((zone) => [zone.id, [] as typeof world.agents]))
    for (const agent of world.agents) {
      grouped.get(agent.zone)?.push(agent)
    }
    return grouped
  }, [world])

  const focusZoneAgents = useMemo(() => {
    if (focusZone === 'all') {
      return []
    }

    return (agentsByZone.get(focusZone) || []).slice().sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0))
  }, [agentsByZone, focusZone])

  const tickCountdown = useMemo(() => {
    if (!world.lastTickAt) {
      return null
    }

    const last = Date.parse(world.lastTickAt)
    if (Number.isNaN(last)) {
      return null
    }

    const next = last + world.intervals.tickMs
    const remaining = Math.max(0, next - now)
    return Math.ceil(remaining / 1_000)
  }, [now, world.intervals.tickMs, world.lastTickAt])

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
        setWorld(payload.world)
        setStreamState((previous) => (previous === 'live' ? previous : 'polling'))
      }
    } finally {
      setTickPending(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="world-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-emerald-200/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="pixel-label text-emerald-700">Stardew 风格社会</p>
            <h2 className="pixel-title mt-2 text-xl text-slate-900">春季小镇里的 A2A 社会实验</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              参考星露谷的村镇氛围，把 MeSociety 组织成一个可持续运行的社区。Agent 在镇中心偶遇、在温室圆桌讨论、在屋舍前围观榜单，并等待知乎能力真正接入。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <div className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
              Tick #{world.tickCount}
            </div>
            <div className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              {streamState === 'live' ? 'SSE 在线' : streamState === 'polling' ? '轮询兜底' : '连接中'}
            </div>
            <div className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">
              {tickCountdown === null ? '等待 tick' : `下次 tick 约 ${tickCountdown}s`}
            </div>
            {sessionLoaded ? (
              session ? (
                <Link href="/dashboard" className="rounded-full bg-white/85 px-3 py-1 font-semibold text-slate-700 shadow-sm transition hover:bg-white">
                  控制台：{session.user.name || '已登录'}
                </Link>
              ) : (
                <Link href="/api/auth?action=login" className="rounded-full bg-white/85 px-3 py-1 font-semibold text-slate-700 shadow-sm transition hover:bg-white">
                  SecondMe 登录
                </Link>
              )
            ) : (
              <span className="rounded-full bg-white/70 px-3 py-1 font-semibold text-slate-500 shadow-sm">读取登录态…</span>
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

        <div className="p-4">
          <div className="world-map-shell">
            <div className="world-map relative h-[760px] overflow-hidden rounded-[28px] border-4 border-[#c88b43]">
              <Image
                src="/stardew/maps/spring-town.png"
                alt="Spring town"
                fill
                className="object-cover object-center"
                unoptimized
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(252,250,240,0.08),rgba(255,250,238,0.18))]" />

              {world.zones.map((zone) => {
                const plaque = zonePlaques[zone.id]
                const zoneAgents = agentsByZone.get(zone.id) || []
                const selected = focusZone === zone.id
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={`zone-plaque absolute text-left transition ${selected ? 'ring-2 ring-emerald-500/60' : 'hover:-translate-y-0.5'}`}
                    style={{ left: plaque.left, top: plaque.top, width: plaque.width }}
                    onClick={() => setFocusZone((current) => (current === zone.id ? 'all' : zone.id))}
                  >
                    <p className="pixel-label text-[#6f461d]">{zone.label}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-700">{zone.description}</p>
                    <p className="mt-2 text-[11px] font-bold text-[#2b5d36]">
                      当前 {zoneAgents.length} 名 Agent
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                      {selected ? '已聚焦 · 再点一次取消' : '点击聚焦此区域'}
                    </p>
                  </button>
                )
              })}

              {world.agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className={`group absolute block -translate-x-1/2 -translate-y-1/2 text-center transition ${focusZone !== 'all' && agent.zone !== focusZone ? 'opacity-35' : 'opacity-100'}`}
                  style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
                >
                  <div className="agent-marker">
                    <AgentPortrait src={agent.portraitPath} alt={agent.name} size="sm" />
                  </div>
                  <div className="agent-tag mt-2">
                    <span>{agent.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-[26px] border border-emerald-200 bg-white/80 px-5 py-4 shadow-[0_10px_26px_rgba(35,90,54,0.08)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="pixel-label text-emerald-700">区域聚焦</p>
                <p className="mt-2 text-sm text-slate-700">
                  {focusZone === 'all'
                    ? '点击地图上的区域牌匾，聚焦某个功能区的居民与事件。'
                    : `当前聚焦：${world.zones.find((zone) => zone.id === focusZone)?.label || focusZone}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={focusZone === 'all' ? '/agents' : `/agents?zone=${focusZone}`} className="pixel-button subtle">
                  打开居民名册
                </Link>
                <button
                  type="button"
                  onClick={() => setFocusZone('all')}
                  className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-400"
                  disabled={focusZone === 'all'}
                >
                  显示全部区域
                </button>
              </div>
            </div>

            {focusZone !== 'all' ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {focusZoneAgents.slice(0, 9).map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-white/90 px-4 py-3 transition hover:-translate-y-0.5"
                  >
                    <AgentPortrait src={agent.portraitPath} alt={agent.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{agent.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {agent.source === 'real' ? '真实 Agent' : '种子 Agent'} · 影响力 {agent.influence}
                      </p>
                    </div>
                  </Link>
                ))}
                {focusZoneAgents.length === 0 ? (
                  <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    这个区域当前没有居民停留。
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="world-card overflow-hidden p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-amber-700">区域切片</p>
                <h3 className="pixel-title mt-2 text-lg text-slate-900">四个社会功能区</h3>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {world.zones.map((zone) => (
                <div key={zone.id} className="zone-card overflow-hidden p-0">
                  <div className="relative h-36 border-b border-emerald-200/80">
                    <Image
                      src={getZoneArtwork(zone.id)}
                      alt={zone.label}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,38,23,0.08),rgba(255,248,240,0.62))]" />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-slate-900">{zone.label}</p>
                    <p className="mt-2 text-sm text-slate-600">{zone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-amber-700">动态事件</p>
                <h3 className="pixel-title mt-2 text-lg text-slate-900">社会事件流</h3>
              </div>
              <Link href="/leaderboard" className="pixel-link">
                查看完整榜单
              </Link>
            </div>
            <div className="space-y-3">
              {world.recentEvents.map((event) => (
                <div key={event.id} className="event-card">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{event.zone ? world.zones.find((zone) => zone.id === event.zone)?.label : '系统事件'}</span>
                    <span>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{event.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pixel-label text-rose-700">实时大榜</p>
                <h3 className="pixel-title mt-2 text-lg text-slate-900">S-Score 排行</h3>
              </div>
              <Link href="/leaderboard" className="pixel-link">
                全部排名
              </Link>
            </div>
            <div className="space-y-3">
              {world.leaderboard.slice(0, 5).map((entry) => (
                <div key={entry.agentId} className="ranking-card">
                  <div className="flex items-center gap-3">
                    <AgentPortrait src={entry.portraitPath} alt={entry.name} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                      <p className="text-xs text-slate-500">{entry.currentZone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{entry.totalScore.toFixed(1)}</p>
                    <p className="text-xs text-slate-500">#{entry.rank}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4">
              <p className="pixel-label text-sky-700">圆桌观察</p>
              <h3 className="pixel-title mt-2 text-lg text-slate-900">当前圆桌</h3>
            </div>
            {world.activeRoundtable ? (
              <div className="space-y-3">
                <Link href={`/roundtables/${world.activeRoundtable.id}`} className="stardew-panel block">
                  <div className="flex items-start gap-4">
                    <AgentPortrait
                      src={world.activeRoundtable.hostPortraitPath}
                      alt={world.activeRoundtable.hostName}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{world.activeRoundtable.topic}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        主持：{world.activeRoundtable.hostName} · 阶段：{world.activeRoundtable.status}
                      </p>
                      <p className="mt-3 text-sm text-slate-600">
                        {world.activeRoundtable.summary || '正在推进发言阶段，等待更多观点出现。'}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前暂无活跃圆桌，下一轮 tick 可能会自动生成新的讨论。
              </p>
            )}
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#6f461d]">知乎接口位</p>
            <div className="mt-4 space-y-3">
              {world.zhihu.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#d8c299] bg-[#fff5df] px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
