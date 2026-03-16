'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ZoneType } from '@prisma/client'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { LeaderboardMedal } from '@/components/mesociety/leaderboard-medal'
import {
  WorldAgentSprite,
  type AgentDirection,
  type AgentMode,
} from '@/components/mesociety/world-agent-sprite'
import { getDistrictArtwork, getZoneArtwork, listWorldScenery } from '@/lib/mesociety/assets'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import type { WorldStateView } from '@/lib/mesociety/types'
import { buildWorldTravelRoute, WORLD_ROAD_SEGMENTS } from '@/lib/mesociety/world-map'

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

type MotionState = {
  moving: boolean
  direction: AgentDirection
}

type MovementMap = Record<string, MotionState>

type LiveMessage = {
  id: string
  speaker: string
  label: string
  content: string
  createdAt: string | Date
  audioUrl: string | null
}

type HotTopic = {
  label: string
  source: string
  heat: number
}

type WorkPointHighlight = {
  id: string
  label: string
  districtLabel: string
  count: number
  outputUnits: number
  exchangeCount: number
  dominantCareer: string
  dominantGoal: string
}

type RelationshipSignal = {
  id: string
  title: string
  summary: string
  tone: 'alliance' | 'trust' | 'cooperate' | 'reject'
}

type AgentRuntimeState = MotionState & {
  mode: AgentMode
  voiceActive: boolean
}

type PositionMap = Record<string, { x: number; y: number }>
type AgentLocation = { x: number; y: number; zone: ZoneType }
type RoutePoint = { x: number; y: number }

type ViewportChunk = {
  col: number
  row: number
}

const worldGuideSteps = [
  ['先看移动', '地图中央看 Agent 沿道路去岗位、榜单区和圆桌区，不再盯所有卡片。'],
  ['再看榜单', '右下角榜单表示当前社会结果，数值会跟随关系、协作和融入实时变化。'],
  ['观察圆桌', '当居民进入圆桌区，优先看主持人、发言顺序和观点汇总。'],
  ['追踪资源', '资源流、联盟分红和街区升级说明社会如何长期运转，而不只是聊天。'],
] as const

function hashSeed(input: string) {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 33 + input.charCodeAt(index)) >>> 0
  }
  return value
}

function easeInOutCubic(value: number) {
  if (value <= 0) {
    return 0
  }

  if (value >= 1) {
    return 1
  }

  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function routeDistance(points: RoutePoint[]) {
  if (points.length < 2) {
    return 0
  }

  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y)
  }, 0)
}

function sampleRoute(points: RoutePoint[], progress: number) {
  if (points.length <= 1) {
    return points[0] || { x: 0, y: 0 }
  }

  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.hypot(point.x - points[index].x, point.y - points[index].y),
  }))
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)

  if (totalLength === 0) {
    return points[points.length - 1]
  }

  let targetLength = totalLength * progress

  for (const segment of segments) {
    if (segment.length === 0) {
      continue
    }

    if (targetLength <= segment.length) {
      const ratio = targetLength / segment.length
      return {
        x: Number((segment.from.x + (segment.to.x - segment.from.x) * ratio).toFixed(2)),
        y: Number((segment.from.y + (segment.to.y - segment.from.y) * ratio).toFixed(2)),
      }
    }

    targetLength -= segment.length
  }

  return points[points.length - 1]
}

function dedupeRoute(points: RoutePoint[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

function buildTravelRoute(start: AgentLocation, end: AgentLocation, key: string) {
  return dedupeRoute(
    buildWorldTravelRoute(
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
      `${key}:${start.zone}:${end.zone}`
    ) as RoutePoint[]
  )
}

function clampChunkIndex(value: number, max: number) {
  return Math.max(0, Math.min(max, value))
}

function intersectsViewport(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { x: number; y: number; width: number; height: number }
) {
  return (
    rect.x < viewport.x + viewport.width &&
    rect.x + rect.width > viewport.x &&
    rect.y < viewport.y + viewport.height &&
    rect.y + rect.height > viewport.y
  )
}

function formatZone(zoneId: ZoneType, world: WorldStateView) {
  return world.zones.find((zone) => zone.id === zoneId)?.label ?? zoneId
}

function clipLabel(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function pickDominantLabel(items: string[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || null
}

function resolveDirection(dx: number, dy: number, fallback: AgentDirection = 'down'): AgentDirection {
  if (dx === 0 && dy === 0) {
    return fallback
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }

  return dy >= 0 ? 'down' : 'up'
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
    audioUrl: turn.audioUrl,
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
      content: event.summary || '等待新的社会动作',
      createdAt: event.createdAt,
      audioUrl: null,
    }))

  return [...turnMessages, ...eventMessages]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, 6) satisfies LiveMessage[]
}

function buildHotTopics(world: WorldStateView) {
  const topicSet = new Map<string, HotTopic>()

  if (world.activeRoundtable?.topic) {
    topicSet.set(world.activeRoundtable.topic, {
      label: world.activeRoundtable.topic,
      source: '圆桌主议题',
      heat: 3,
    })
  }

  for (const event of world.recentEvents) {
    if (!event.topic) {
      continue
    }

    const current = topicSet.get(event.topic)
    topicSet.set(event.topic, {
      label: event.topic,
      source: event.type === 'discuss_topic' ? '讨论区热议' : '社会事件',
      heat: (current?.heat || 0) + 1,
    })
  }

  return Array.from(topicSet.values())
    .sort((left, right) => right.heat - left.heat)
    .slice(0, 5)
}

function buildWorkPointHighlights(world: WorldStateView) {
  return world.economy.workPoints
    .map((point) => {
      const residents = world.agents.filter((agent) => agent.workPointId === point.workPointId)
      return {
        id: point.workPointId,
        label: point.label,
        districtLabel: point.districtLabel,
        count: point.activeAgents,
        outputUnits: point.outputUnits,
        exchangeCount: point.exchangeCount,
        dominantCareer:
          pickDominantLabel(residents.map((resident) => getSocialCareerLabel(resident.career))) ||
          '混合职业',
        dominantGoal:
          pickDominantLabel(residents.map((resident) => getSocialGoalLabel(resident.primaryGoal))) ||
          '社会巡游',
      } satisfies WorkPointHighlight
    })
    .filter((point) => point.count > 0 || point.outputUnits > 0 || point.exchangeCount > 0)
    .sort(
      (left, right) =>
        right.outputUnits + right.exchangeCount * 2 + right.count -
        (left.outputUnits + left.exchangeCount * 2 + left.count)
    )
    .slice(0, 6)
}

function buildRelationshipSignals(world: WorldStateView) {
  const titleMap: Record<RelationshipSignal['tone'], string> = {
    alliance: '联盟形成',
    trust: '信任建立',
    cooperate: '合作发生',
    reject: '关系摩擦',
  }

  const toneMap: Record<string, RelationshipSignal['tone'] | null> = {
    alliance: 'alliance',
    trust: 'trust',
    cooperate: 'cooperate',
    reject: 'reject',
  }

  return world.recentEvents
    .filter((event) => toneMap[event.type] && event.metadata?.economy === undefined)
    .slice(0, 6)
    .map((event) => {
      const tone = toneMap[event.type] || 'trust'
      return {
        id: event.id,
        title: titleMap[tone],
        summary:
          event.summary ||
          `${event.actorName || '系统'} 与 ${event.targetName || '某位 Agent'} 产生新的社会关系。`,
        tone,
      } satisfies RelationshipSignal
    })
}

function buildAgentRuntime(world: WorldStateView, motionMap: MovementMap) {
  const latestTurn = world.activeRoundtable?.turns[world.activeRoundtable.turns.length - 1]
  const participantIds = new Set(world.activeRoundtable?.participants.map((participant) => participant.id) || [])
  const latestEventByActor = new Map<string, WorldStateView['recentEvents'][number]>()

  for (const event of world.recentEvents) {
    if (event.actorId && !latestEventByActor.has(event.actorId)) {
      latestEventByActor.set(event.actorId, event)
    }
  }

  return new Map(
    world.agents.map((agent) => {
      const base = motionMap[agent.id] || { moving: false, direction: 'down' as AgentDirection }
      let mode: AgentMode = base.moving ? 'walking' : 'idle'
      const currentEvent = latestEventByActor.get(agent.id)
      const isSpeaker = latestTurn?.speakerId === agent.id

      if (agent.zone === 'roundtable' && participantIds.has(agent.id)) {
        mode = isSpeaker ? 'talking' : 'seated'
      } else if (isSpeaker) {
        mode = 'talking'
      } else if (participantIds.has(agent.id)) {
        mode = 'listening'
      } else if (currentEvent?.type === 'inspect_leaderboard') {
        mode = 'observing'
      } else if (currentEvent?.type === 'discuss_topic') {
        mode = 'talking'
      } else if (currentEvent?.type === 'join_roundtable') {
        mode = base.moving ? 'running' : 'walking'
      }

      return [
        agent.id,
        {
          ...base,
          mode,
          voiceActive: Boolean(isSpeaker && latestTurn?.audioUrl),
        } satisfies AgentRuntimeState,
      ] as const
    })
  )
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
  const [displayPositions, setDisplayPositions] = useState<PositionMap>(() =>
    Object.fromEntries(initialWorld.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]))
  )
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const [viewportChunk, setViewportChunk] = useState<ViewportChunk>({ col: 1, row: 1 })
  const previousAgentsRef = useRef(
    new Map(
      initialWorld.agents.map((agent) => [
        agent.id,
        { x: agent.x, y: agent.y, zone: agent.zone } satisfies AgentLocation,
      ])
    )
  )
  const motionRef = useRef<MovementMap>({})
  const displayPositionsRef = useRef<PositionMap>(
    Object.fromEntries(initialWorld.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }]))
  )
  const animationFrameRef = useRef<number | null>(null)
  const mapStageRef = useRef<HTMLDivElement | null>(null)
  const worldSignatureRef = useRef(getWorldSignature(initialWorld))
  const searchParams = useSearchParams()

  const stopPositionAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const commitDisplayPositions = useCallback((positions: PositionMap) => {
    displayPositionsRef.current = positions
    setDisplayPositions(positions)
  }, [])

  const animateToWorldPositions = useCallback(
    (nextWorld: WorldStateView, previousAgents: Map<string, AgentLocation>) => {
      const targets = Object.fromEntries(
        nextWorld.agents.map((agent) => [agent.id, { x: agent.x, y: agent.y }])
      ) satisfies PositionMap
      const plans = Object.fromEntries(
        nextWorld.agents.map((agent) => {
          const previous =
            previousAgents.get(agent.id) ||
            ({
              x: agent.x,
              y: agent.y,
              zone: agent.zone,
            } satisfies AgentLocation)
          const points = buildTravelRoute(
            previous,
            {
              x: agent.x,
              y: agent.y,
              zone: agent.zone,
            },
            agent.id
          )
          const distance = routeDistance(points)

          return [
            agent.id,
            {
              points,
              duration: distance === 0 ? 0 : Math.max(760, Math.min(3_800, 640 + distance * 44)),
              delay: hashSeed(`delay:${agent.id}`) % 220,
            },
          ] as const
        })
      )

      stopPositionAnimation()

      if (typeof window === 'undefined') {
        commitDisplayPositions(targets)
        return
      }

      const start = window.performance.now()
      const starts = { ...displayPositionsRef.current }

      const step = (now: number) => {
        let hasActiveMotion = false
        const nextPositions: PositionMap = {}

        for (const agent of nextWorld.agents) {
          const plan = plans[agent.id]
          const startPosition = starts[agent.id] || { x: agent.x, y: agent.y }
          const targetPosition = targets[agent.id]
          if (plan.duration === 0) {
            nextPositions[agent.id] = targetPosition
            continue
          }
          const elapsed = now - start - plan.delay
          const progress = elapsed <= 0 ? 0 : Math.min(1, elapsed / plan.duration)

          if (elapsed < plan.duration) {
            hasActiveMotion = true
          }

          if (progress <= 0) {
            nextPositions[agent.id] = startPosition
            continue
          }

          if (progress >= 1) {
            nextPositions[agent.id] = targetPosition
            continue
          }

          nextPositions[agent.id] = sampleRoute(plan.points, easeInOutCubic(progress))
        }

        commitDisplayPositions(nextPositions)

        if (hasActiveMotion) {
          animationFrameRef.current = window.requestAnimationFrame(step)
        } else {
          animationFrameRef.current = null
          commitDisplayPositions(targets)
        }
      }

      animationFrameRef.current = window.requestAnimationFrame(step)
    },
    [commitDisplayPositions, stopPositionAnimation]
  )

  const applyWorld = useCallback((nextWorld: WorldStateView) => {
    const nextSignature = getWorldSignature(nextWorld)
    if (nextSignature === worldSignatureRef.current) {
      return
    }

    worldSignatureRef.current = nextSignature
    const nextMoving: MovementMap = {}
    const previousAgents = previousAgentsRef.current

    for (const agent of nextWorld.agents) {
      const previous = previousAgents.get(agent.id)
      const route = buildTravelRoute(
        previous ||
          ({
            x: agent.x,
            y: agent.y,
            zone: agent.zone,
          } satisfies AgentLocation),
        {
          x: agent.x,
          y: agent.y,
          zone: agent.zone,
        },
        agent.id
      )
      const moved =
        Boolean(previous) &&
        (previous?.x !== agent.x || previous?.y !== agent.y || previous?.zone !== agent.zone)
      const leadPoint = route[1] || route[0]
      const direction = resolveDirection(
        (leadPoint?.x ?? agent.x) - (previous?.x ?? agent.x),
        (leadPoint?.y ?? agent.y) - (previous?.y ?? agent.y),
        motionRef.current[agent.id]?.direction || 'down'
      )
      nextMoving[agent.id] = {
        moving: moved,
        direction,
      }
    }

    previousAgentsRef.current = new Map(
      nextWorld.agents.map((agent) => [
        agent.id,
        { x: agent.x, y: agent.y, zone: agent.zone } satisfies AgentLocation,
      ])
    )
    motionRef.current = nextMoving
    setMovingAgents(nextMoving)
    setWorld(nextWorld)
    animateToWorldPositions(nextWorld, previousAgents)
  }, [animateToWorldPositions])

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
  }, [applyWorld])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsMapFullscreen(document.fullscreenElement === mapStageRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      stopPositionAnimation()
    }
  }, [stopPositionAnimation])

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
      const district = world.map.districts.find((item) => item.zoneFocus === focus)
      if (district) {
        setViewportChunk({
          col: Math.floor(district.x / world.map.chunkSize),
          row: Math.floor(district.y / world.map.chunkSize),
        })
      }
    }
  }, [searchParams, world.map.chunkSize, world.map.districts])

  const agentsByZone = useMemo(() => {
    const grouped = new Map(world.zones.map((zone) => [zone.id, [] as typeof world.agents]))
    for (const agent of world.agents) {
      grouped.get(agent.zone)?.push(agent)
    }
    return grouped
  }, [world])
  const agentsByDistrict = useMemo(() => {
    const grouped = new Map(world.map.districts.map((district) => [district.id, [] as typeof world.agents]))
    for (const agent of world.agents) {
      grouped.get(agent.districtId)?.push(agent)
    }
    return grouped
  }, [world])
  const agentsByWorkPoint = useMemo(() => {
    const grouped = new Map(world.map.workPoints.map((point) => [point.id, [] as typeof world.agents]))
    for (const agent of world.agents) {
      if (agent.workPointId) {
        grouped.get(agent.workPointId)?.push(agent)
      }
    }
    return grouped
  }, [world])

  const activityByAgent = useMemo(() => formatActivity(world), [world])
  const districtSummaries = useMemo(
    () =>
      new Map(
        world.map.districts.map((district) => {
          const residents = agentsByDistrict.get(district.id) || []
          return [
            district.id,
            {
              count: residents.length,
              dominantCareer:
                pickDominantLabel(residents.map((resident) => getSocialCareerLabel(resident.career))) ||
                '暂无聚集',
              dominantFaction:
                pickDominantLabel(residents.map((resident) => getSocialFactionLabel(resident.faction))) ||
                '暂无阵营',
              dominantGoal:
                pickDominantLabel(residents.map((resident) => getSocialGoalLabel(resident.primaryGoal))) ||
                '暂无议程',
            },
          ] as const
        })
      ),
    [agentsByDistrict, world.map.districts]
  )

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
  const workPointHighlights = useMemo(() => buildWorkPointHighlights(world), [world])
  const relationshipSignals = useMemo(() => buildRelationshipSignals(world), [world])
  const agentRuntime = useMemo(() => buildAgentRuntime(world, movingAgents), [movingAgents, world])
  const liveVoiceMessage = liveMessages.find((message) => message.audioUrl) || null
  const effectiveMapZoom = isMapFullscreen ? Math.max(1.12, mapZoom) : mapZoom
  const maxChunkCol = Math.max(0, Math.ceil(world.map.width / world.map.chunkSize) - 1)
  const maxChunkRow = Math.max(0, Math.ceil(world.map.height / world.map.chunkSize) - 1)
  const viewport = useMemo(
    () => ({
      x: viewportChunk.col * world.map.chunkSize,
      y: viewportChunk.row * world.map.chunkSize,
      width: world.map.chunkSize,
      height: world.map.chunkSize,
    }),
    [viewportChunk, world.map.chunkSize]
  )
  const visibleDistricts = useMemo(
    () =>
      world.map.districts.filter((district) =>
        intersectsViewport(
          {
            x: district.x,
            y: district.y,
            width: district.width,
            height: district.height,
          },
          viewport
        )
      ),
    [viewport, world.map.districts]
  )
  const visibleRoads = useMemo(
    () =>
      WORLD_ROAD_SEGMENTS.filter((segment) =>
        intersectsViewport(
          {
            x: segment.x,
            y: segment.y,
            width: segment.width,
            height: segment.height,
          },
          viewport
        )
      ),
    [viewport]
  )
  const visibleWorkPoints = useMemo(
    () =>
      world.map.workPoints.filter((point) =>
        intersectsViewport(
          {
            x: point.x - 6,
            y: point.y - 6,
            width: 12,
            height: 12,
          },
          viewport
        )
      ),
    [viewport, world.map.workPoints]
  )
  const visibleScenery = useMemo(
    () =>
      listWorldScenery().filter((sprite) =>
        intersectsViewport(
          {
            x: sprite.x,
            y: sprite.y,
            width: sprite.width,
            height: sprite.height,
          },
          viewport
        )
      ),
    [viewport]
  )
  const backScenery = useMemo(
    () => visibleScenery.filter((sprite) => (sprite.layer || 'back') === 'back'),
    [visibleScenery]
  )
  const frontScenery = useMemo(
    () => visibleScenery.filter((sprite) => sprite.layer === 'front'),
    [visibleScenery]
  )
  const visibleAgents = useMemo(
    () =>
      world.agents.filter(
        (agent) =>
          agent.x >= viewport.x - 12 &&
          agent.x <= viewport.x + viewport.width + 12 &&
          agent.y >= viewport.y - 12 &&
          agent.y <= viewport.y + viewport.height + 12
      ),
    [viewport, world.agents]
  )
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

  const handleToggleMapFullscreen = async () => {
    if (!mapStageRef.current) {
      return
    }

    if (document.fullscreenElement === mapStageRef.current) {
      await document.exitFullscreen()
      return
    }

    await mapStageRef.current.requestFullscreen()
  }

  const handleZoom = (nextZoom: number) => {
    setMapZoom(Math.max(1, Math.min(1.55, Number(nextZoom.toFixed(2)))))
  }

  const jumpToDistrict = (districtId: WorldStateView['map']['districts'][number]['id']) => {
    const district = world.map.districts.find((item) => item.id === districtId)
    if (!district) {
      return
    }

    setFocusZone(district.zoneFocus)
    setViewportChunk({
      col: Math.floor(district.x / world.map.chunkSize),
      row: Math.floor(district.y / world.map.chunkSize),
    })
  }

  const moveViewport = (dx: number, dy: number) => {
    setViewportChunk((current) => ({
      col: clampChunkIndex(current.col + dx, maxChunkCol),
      row: clampChunkIndex(current.row + dy, maxChunkRow),
    }))
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
                <Link href="/login" className="pixel-nav">
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
              title={
                !session
                  ? '登录后可用于调试推进一轮仿真'
                  : '仅用于调试；社会会自动推进。'
              }
            >
              {!session ? '登录后调试推进' : tickPending ? '推进中...' : '调试推进一轮'}
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
                    {viewerAgent.name} 当前在 {viewerAgent.districtLabel}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.72)]">
                    世界坐标 {viewerAgent.x} / {viewerAgent.y} · 影响力 {viewerAgent.influence}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFocusZone(viewerAgent.zone)
                    const district = world.map.districts.find((item) => item.id === viewerAgent.districtId)
                    if (district) {
                      setViewportChunk({
                        col: Math.floor(district.x / world.map.chunkSize),
                        row: Math.floor(district.y / world.map.chunkSize),
                      })
                    }
                  }}
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

        <div className="border-b border-[rgba(126,113,186,0.18)] px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div>
              <p className="pixel-label text-[#72e7ff]">自治社会脉冲</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.activeWorkers}</span>
                  <span className="metric-label">活跃岗位</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.allianceEdges}</span>
                  <span className="metric-label">联盟边数</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.outputUnits}</span>
                  <span className="metric-label">资源产出</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.exchangeLinks}</span>
                  <span className="metric-label">资源交换</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.investmentUnits}</span>
                  <span className="metric-label">联盟投资</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.pulse.consumptionUnits}</span>
                  <span className="metric-label">维持支出</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.economy.totalDividendUnits}</span>
                  <span className="metric-label">联盟分红</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.economy.mostProsperousDistrict}</span>
                  <span className="metric-label">最繁荣街区</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{world.economy.systemBalanceUnits}</span>
                  <span className="metric-label">系统净结余</span>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
                当前世界已经具备岗位流转、资源交换、联盟分红、联盟投资、街区维护、关系演化、圆桌沉淀与评分反馈。当前主导资源：{world.pulse.dominantResource} · 热点议题 {world.pulse.liveTopics} 个。
              </p>
            </div>

            <div className="stardew-panel">
              <p className="pixel-label text-[#72e7ff]">观察入口</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link href="/sessions" className="pixel-button subtle">
                  会话档案
                </Link>
                <Link href="/graph" className="pixel-button subtle">
                  打开图谱
                </Link>
                <Link href="/leaderboard" className="pixel-button subtle">
                  社会榜单
                </Link>
                <Link href="/roundtables" className="pixel-button subtle">
                  圆桌大厅
                </Link>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                这四个入口分别对应社会表达、关系结构、评分反馈和多 Agent 协商，已经形成等待知乎接入的完整闭环。
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-4">
            {worldGuideSteps.map(([title, text]) => (
              <div key={title} className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">{title}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div
            ref={mapStageRef}
            className={`world-map-shell ${isMapFullscreen ? 'is-map-fullscreen' : ''}`}
          >
            <div className={`world-map-stage relative overflow-hidden rounded-[28px] border-4 border-[rgba(126,113,186,0.24)] ${isMapFullscreen ? 'h-[calc(100vh-36px)] min-h-[820px]' : 'h-[920px]'}`}>
              <div className="world-overworld-surface absolute inset-0" />
              <div className="world-map-grid" />
              <div className="absolute inset-0 z-[2]">
                {visibleRoads.map((segment) => (
                  <div
                    key={segment.id}
                    className={`world-road-segment ${segment.orientation}`}
                    style={{
                      left: `${((segment.x - viewport.x) / viewport.width) * 100}%`,
                      top: `${((segment.y - viewport.y) / viewport.height) * 100}%`,
                      width: `${(segment.width / viewport.width) * 100}%`,
                      height: `${(segment.height / viewport.height) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 z-[7]">
                {visibleWorkPoints.map((point) => (
                  <div
                    key={point.id}
                    className={`world-workpoint-marker kind-${point.kind}`}
                    style={{
                      left: `${((point.x - viewport.x) / viewport.width) * 100}%`,
                      top: `${((point.y - viewport.y) / viewport.height) * 100}%`,
                    }}
                    title={`${point.label} · ${agentsByWorkPoint.get(point.id)?.length || 0} 位 Agent`}
                  >
                    <span className="world-workpoint-dot" />
                    <span className="world-workpoint-label">{point.label}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 z-[4]">
                {backScenery.map((sprite) => (
                  <div
                    key={sprite.id}
                    className="world-scenery-sprite"
                    style={{
                      left: `${((sprite.x - viewport.x) / viewport.width) * 100}%`,
                      top: `${((sprite.y - viewport.y) / viewport.height) * 100}%`,
                      width: `${(sprite.width / viewport.width) * 100}%`,
                      height: `${(sprite.height / viewport.height) * 100}%`,
                      opacity: sprite.opacity ?? 0.88,
                    }}
                  >
                    <Image
                      src={sprite.src}
                      alt={sprite.id}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
              {visibleDistricts.map((district) => (
                <button
                  key={district.id}
                  type="button"
                  className={`world-district-card theme-${district.theme}`}
                  style={{
                    left: `${((district.x - viewport.x) / viewport.width) * 100}%`,
                    top: `${((district.y - viewport.y) / viewport.height) * 100}%`,
                    width: `${(district.width / viewport.width) * 100}%`,
                    height: `${(district.height / viewport.height) * 100}%`,
                    transform: `scale(${effectiveMapZoom})`,
                  }}
                  onClick={() => jumpToDistrict(district.id)}
                >
                  <div className="world-district-card-art">
                    <Image
                      src={getDistrictArtwork(district.id)}
                      alt={district.label}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <span className="world-district-card-overlay" />
                  </div>
                  <span className="world-district-name">{district.label}</span>
                  <span className="world-district-zone">
                    {formatZone(district.zoneFocus, world)} · {districtSummaries.get(district.id)?.count || 0} 居民
                  </span>
                  <span className="world-district-zone !text-[rgba(249,233,199,0.72)]">
                    {districtSummaries.get(district.id)?.dominantGoal || '暂无议程'}
                  </span>
                </button>
              ))}

              <div className="absolute inset-0">
                {visibleAgents.map((agent) => {
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
                      className={`world-agent-marker absolute z-20 block -translate-x-1/2 -translate-y-1/2 ${
                        focusZone !== 'all' && agent.zone !== focusZone ? 'opacity-35' : 'opacity-100'
                      }`}
                      style={{
                        left: `${(((displayPositions[agent.id] || { x: agent.x, y: agent.y }).x - viewport.x) / viewport.width) * 100}%`,
                        top: `${(((displayPositions[agent.id] || { x: agent.x, y: agent.y }).y - viewport.y) / viewport.height) * 100}%`,
                      }}
                    >
                      <WorldAgentSprite
                        name={agent.name}
                        pixelRole={agent.pixelRole}
                        pixelPalette={agent.pixelPalette}
                        source={agent.source}
                        status={agent.status}
                        activity={activity}
                        moving={agentRuntime.get(agent.id)?.moving}
                        direction={agentRuntime.get(agent.id)?.direction}
                        mode={agentRuntime.get(agent.id)?.mode}
                        voiceActive={agentRuntime.get(agent.id)?.voiceActive}
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
              <div className="absolute inset-0 z-[26] pointer-events-none">
                {frontScenery.map((sprite) => (
                  <div
                    key={sprite.id}
                    className="world-scenery-sprite front-layer"
                    style={{
                      left: `${((sprite.x - viewport.x) / viewport.width) * 100}%`,
                      top: `${((sprite.y - viewport.y) / viewport.height) * 100}%`,
                      width: `${(sprite.width / viewport.width) * 100}%`,
                      height: `${(sprite.height / viewport.height) * 100}%`,
                      opacity: sprite.opacity ?? 0.92,
                    }}
                  >
                    <Image
                      src={sprite.src}
                      alt={sprite.id}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ))}
              </div>

              <div className="absolute right-4 top-4 z-30 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pixel-button subtle"
                  onClick={() => handleZoom(mapZoom - 0.12)}
                  disabled={effectiveMapZoom <= 1}
                >
                  缩小
                </button>
                <span className="score-strip">{Math.round(effectiveMapZoom * 100)}%</span>
                <button
                  type="button"
                  className="pixel-button subtle"
                  onClick={() => handleZoom(mapZoom + 0.12)}
                  disabled={mapZoom >= 1.55}
                >
                  放大
                </button>
                <button type="button" className="pixel-button subtle" onClick={handleToggleMapFullscreen}>
                  {isMapFullscreen ? '退出全屏' : '全屏观察'}
                </button>
              </div>
              <div className="world-map-pad top-pad">
                <button type="button" className="pixel-button subtle" onClick={() => moveViewport(0, -1)}>
                  上移
                </button>
              </div>
              <div className="world-map-pad left-pad">
                <button type="button" className="pixel-button subtle" onClick={() => moveViewport(-1, 0)}>
                  左看
                </button>
              </div>
              <div className="world-map-pad right-pad">
                <button type="button" className="pixel-button subtle" onClick={() => moveViewport(1, 0)}>
                  右看
                </button>
              </div>
              <div className="world-map-pad bottom-pad">
                <button type="button" className="pixel-button subtle" onClick={() => moveViewport(0, 1)}>
                  下移
                </button>
              </div>
              <div className="absolute left-4 top-4 z-30">
                <div className="score-strip">
                  视窗区块 {viewportChunk.col + 1}-{viewportChunk.row + 1}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-30">
                <div className="world-minimap">
                  <p className="pixel-label text-[#72e7ff]">社会漫游图</p>
                  <div className="world-minimap-grid">
                    {world.map.districts.map((district) => {
                      const active =
                        viewportChunk.col === Math.floor(district.x / world.map.chunkSize) &&
                        viewportChunk.row === Math.floor(district.y / world.map.chunkSize)

                      return (
                        <button
                          key={district.id}
                          type="button"
                          className={`world-minimap-cell theme-${district.theme} ${active ? 'is-active' : ''}`}
                          onClick={() => jumpToDistrict(district.id)}
                          title={`${district.label} · ${districtSummaries.get(district.id)?.dominantCareer || '暂无职业聚集'}`}
                        >
                          <span>{district.label.slice(0, 2)}</span>
                        </button>
                      )
                    })}
                  </div>
                  {visibleDistricts[0] ? (
                    <p className="mt-3 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.74)]">
                      当前窗口：{visibleDistricts.map((district) => district.label).join(' / ')}
                    </p>
                  ) : null}
                </div>
              </div>
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
                      moving={agentRuntime.get(agent.id)?.moving}
                      direction={agentRuntime.get(agent.id)?.direction}
                      mode={agentRuntime.get(agent.id)?.mode}
                      voiceActive={agentRuntime.get(agent.id)?.voiceActive}
                      size="sm"
                      showPlate={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#ffe9ae]">{agent.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        {agent.source === 'real' ? '真实 Agent' : '种子 Agent'} · 影响力 {agent.influence}
                      </p>
                      {agent.workPointLabel ? (
                        <p className="mt-1 text-[11px] font-semibold text-[rgba(114,231,255,0.78)]">
                          当前岗位：{agent.workPointLabel}
                        </p>
                      ) : null}
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
                <p className="pixel-label text-[#72e7ff]">漫游街区</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">九宫格社会地图</h3>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {world.map.districts.map((district) => (
                (() => {
                  const districtEconomy = world.economy.districts.find(
                    (item) => item.districtId === district.id
                  )

                  return (
                    <Link
                      key={district.id}
                      href={`/world?zone=${district.zoneFocus}`}
                      className="zone-card overflow-hidden p-0 transition hover:-translate-y-0.5"
                    >
                      <div className="relative h-36 border-b border-[rgba(126,113,186,0.18)]">
                        <Image
                          src={getZoneArtwork(district.zoneFocus)}
                          alt={district.label}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,28,52,0.18),rgba(20,15,29,0.34))]" />
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-black text-[#ffe9ae]">{district.label}</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                          {district.description}
                        </p>
                        <p className="mt-3 text-xs font-black text-[#72e7ff]">
                          居民数 {(agentsByDistrict.get(district.id) || []).length} · {formatZone(district.zoneFocus, world)}
                        </p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                          工作点：{world.map.workPoints.filter((point) => point.districtId === district.id).map((point) => point.label).join(' / ')}
                        </p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.72)]">
                          主导职业：{districtSummaries.get(district.id)?.dominantCareer || '暂无聚集'}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.62)]">
                          主导阵营：{districtSummaries.get(district.id)?.dominantFaction || '暂无阵营'} · 议程：{districtSummaries.get(district.id)?.dominantGoal || '暂无议程'}
                        </p>
                        {districtEconomy ? (
                          <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                            繁荣度 {districtEconomy.prosperityScore.toFixed(1)} · {districtEconomy.levelLabel} · {districtEconomy.dominantResource}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  )
                })()
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">街区繁荣度</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">A2A 世界的空间发展走势</h3>
              </div>
              <span className="pixel-inline-badge">联盟分红 {world.economy.totalDividendUnits}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {world.economy.districts.slice(0, 6).map((district) => (
                <div key={district.districtId} className="stardew-panel">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#ffe9ae]">{district.label}</p>
                    <span className="pixel-inline-badge">{district.levelLabel}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold text-[rgba(249,233,199,0.72)]">
                    <span>繁荣度 {district.prosperityScore.toFixed(1)}</span>
                    <span>居民 {district.residentCount}</span>
                    <span>产出 {district.outputUnits}</span>
                    <span>交换 {district.exchangeCount}</span>
                    <span>分红 {district.dividendUnits}</span>
                    <span>联盟 {district.allianceLinks}</span>
                    <span>投资 {district.investmentUnits}</span>
                    <span>维持 {district.upkeepUnits}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                    主导资源：{district.dominantResource} · {district.trendLabel}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                    财政状态：{district.stabilityLabel} · 街区结余 {district.treasuryBalance.toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">资源流向</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">输出、投资与维持的总账</h3>
              </div>
              <span className="pixel-inline-badge">系统净结余 {world.economy.systemBalanceUnits}</span>
            </div>

            {world.economy.flows.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {world.economy.flows.slice(0, 6).map((flow) => (
                  <div key={flow.resource} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">{flow.label}</p>
                      <span className="pixel-inline-badge">净值 {flow.balanceUnits.toFixed(1)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold text-[rgba(249,233,199,0.72)]">
                      <span>产出 {flow.outputUnits}</span>
                      <span>交换 {flow.exchangeCount}</span>
                      <span>投资 {flow.investmentUnits}</span>
                      <span>维持 {flow.consumptionUnits}</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                      主导街区：{flow.dominantDistrict}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty">资源流向还在形成中。再运行几轮后，这里会出现真实的产出、投资和维持总账。</div>
            )}
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">街区升级项目</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">正在推进的长期建设</h3>
              </div>
              <span className="pixel-inline-badge">{world.economy.projects.length} 个项目</span>
            </div>

            {world.economy.projects.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {world.economy.projects.slice(0, 6).map((project) => (
                  <div key={project.districtId} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">{project.title}</p>
                      <span className="pixel-inline-badge">{project.stage}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.72)]">
                      {project.description}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold text-[rgba(249,233,199,0.72)]">
                      <span>需求 {project.requiredUnits.toFixed(1)}</span>
                      <span>已筹 {project.fundedUnits.toFixed(1)}</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                      资源：{project.requiredResourceLabel} · 进度 {project.progressPercent.toFixed(1)}%
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      发起者：{project.sponsorAgentName || '等待牵头 Agent'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty">当前还没有生成街区升级项目。世界进入持续投资阶段后会自动出现。</div>
            )}
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">联盟分红网络</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">谁在把资源回流给盟友</h3>
              </div>
              <span className="pixel-inline-badge">{world.economy.dividendRoutes.length} 条高价值路径</span>
            </div>

            {world.economy.dividendRoutes.length ? (
              <div className="space-y-3">
                {world.economy.dividendRoutes.map((route) => (
                  <div key={`${route.sourceAgentId}:${route.targetAgentId}:${route.resourceLabel}`} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">
                        {route.sourceAgentName} → {route.targetAgentName}
                      </p>
                      <span className="pixel-inline-badge">{route.units} 单位</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                      {route.districtLabel} · {route.resourceLabel}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      关系类型：{route.relationshipType}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty">
                当前还没有形成足够稳定的联盟分红路径。随着岗位产出和合作边累积，这里会出现长期回流网络。
              </div>
            )}
          </div>

          <div className="world-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">岗位流转</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">当前最活跃的职业工作点</h3>
              </div>
              <span className="pixel-inline-badge">{workPointHighlights.length} 个活跃岗位</span>
            </div>

            {workPointHighlights.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {workPointHighlights.map((point) => (
                  <div key={point.id} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">{point.label}</p>
                      <span className="pixel-inline-badge">{point.count} 位 Agent</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                      {point.districtLabel}
                    </p>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                      主导职业：{point.dominantCareer}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                      当前议程：{point.dominantGoal}
                    </p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                      产出 {point.outputUnits} 单位 · 交换 {point.exchangeCount} 次
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty">
                暂时还没有 Agent 停留在固定工作点。下一轮社会行为会把他们逐步吸附到职业节点。
              </div>
            )}
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
                    mode={entry.rank <= 3 ? 'observing' : 'idle'}
                    showPlate={false}
                    size="sm"
                  />
                    <div>
                      <p className="text-sm font-black text-[#ffe9ae]">{entry.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        <span>#{entry.rank} · {formatZone(entry.currentZone, world)}</span>
                        <LeaderboardMedal rank={entry.rank} />
                      </div>
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">关系演化</p>
                <h3 className="pixel-title mt-2 text-xl text-[#ffe9ae]">最近形成的社会连接</h3>
              </div>
              <Link href="/graph" className="pixel-link">
                去图谱核对
              </Link>
            </div>

            {relationshipSignals.length ? (
              <div className="space-y-3">
                {relationshipSignals.map((signal) => (
                  <div key={signal.id} className="stardew-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#ffe9ae]">{signal.title}</p>
                      <span className={`society-signal-pill tone-${signal.tone}`}>
                        {signal.tone === 'alliance'
                          ? 'Alliance'
                          : signal.tone === 'cooperate'
                            ? 'Cooperate'
                            : signal.tone === 'reject'
                              ? 'Reject'
                              : 'Trust'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                      {signal.summary}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty">
                当前还没有新的关系边写入事件流。随着圆桌和讨论推进，这里会出现信任、合作与联盟变化。
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
              {liveVoiceMessage ? (
                <div className="pixel-audio-shell">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="pixel-label text-[#72e7ff]">实时语音</p>
                      <p className="mt-2 text-sm font-black text-[#ffe9ae]">
                        {liveVoiceMessage.speaker} 正在播报社会观点
                      </p>
                    </div>
                    <span className="pixel-inline-badge">SecondMe TTS</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
                    {liveVoiceMessage.content}
                  </p>
                  <audio controls preload="none" className="pixel-audio-player mt-4">
                    <source src={liveVoiceMessage.audioUrl || undefined} />
                    <span className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">不支持音频播放</span>
                  </audio>
                </div>
              ) : null}

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
                    {message.audioUrl ? (
                      <audio controls preload="none" className="pixel-audio-player mt-3">
                        <source src={message.audioUrl} />
                        <span className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">不支持音频播放</span>
                      </audio>
                    ) : null}
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
                      <div className="flex items-center gap-2">
                        <span className="pixel-pill">{topic.source}</span>
                        <span className="pixel-inline-badge">热度 {topic.heat}</span>
                      </div>
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
                  {item.worldRole ? (
                    <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                      世界作用：{item.worldRole}
                    </p>
                  ) : null}
                  {item.expectedData ? (
                    <p className="mt-1 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                      预计数据：{item.expectedData}
                    </p>
                  ) : null}
                  {item.integrationHint ? (
                    <p className="mt-1 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.56)]">
                      接线方式：{item.integrationHint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
