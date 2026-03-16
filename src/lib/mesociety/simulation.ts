import type {
  Agent,
  AgentBehaviorStyle,
  AgentSnapshot,
  AgentStance,
  GraphEdgeType,
  GraphNodeType,
  Prisma,
  RelationshipType,
  Roundtable,
  RoundtableParticipant,
  RoundtableStatus,
  RoundtableTurn,
  SocialEvent,
  User,
  ZonePresence,
  ZoneType,
} from '@prisma/client'
import { env } from '@/lib/env'
import { getNeo4jGraphView, mirrorGraphToNeo4j } from '@/lib/neo4j'
import { prisma } from '@/lib/prisma'
import {
  deriveBehaviorStyleFromShades,
  deriveStanceFromMemory,
  fetchSecondMeProfile,
  fetchSecondMeShades,
  fetchSecondMeSoftMemory,
  generateSecondMeTTS,
  getValidAccessToken,
  ingestAgentMemoryEvent,
  streamSecondMeAct,
  streamSecondMeChat,
  type SecondMeIngestEvent,
  type SecondMeMemory,
  type SecondMeProfile,
  type SecondMeShade,
} from '@/lib/secondme'
import {
  ensureZhihuCapabilities,
  getZhihuWorldSignals,
  listHotTopics,
  listZhihuCapabilities,
} from '@/lib/zhihu'
import { getPortraitForAgent } from '@/lib/mesociety/assets'
import { deriveAvatarProfile } from '@/lib/mesociety/avatar'
import {
  deriveSocialProfile,
  getEconomicResourceForCareer,
  getEconomicResourceForDistrict,
  getEconomicResourceLabel,
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
  type SocialProfile,
} from '@/lib/mesociety/social'
import { seedAgentDefinitions } from '@/lib/mesociety/seeds'
import { calculateSScore } from '@/lib/mesociety/score'
import { buildWorldExternalSignalsView } from '@/lib/mesociety/view-builders'
import type {
  AgentDetailView,
  AllianceDividendRouteView,
  AgentEconomyView,
  AgentSocietyStats,
  AgentWithSnapshot,
  BehaviorInsightView,
  DistrictProsperityView,
  DistrictUpgradePlanView,
  EconomyFlowView,
  EconomyWorkPointView,
  GraphView,
  LeaderboardEntry,
  RoundtableDetailView,
  RoundtableRelationshipChangeView,
  RoundtableOrchestrationView,
  RoundtableSummary,
  SocialGuidanceView,
  SocialPersonaView,
  SocietyEconomyView,
  SocietyPulseView,
  WorldAgentView,
  WorldEventView,
  WorldStateView,
  ZhihuStatusView,
} from '@/lib/mesociety/types'
import {
  WORLD_CHUNK_SIZE,
  WORLD_DISTRICTS,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
  WORLD_WORK_POINTS,
  getDefaultDistrictForZone,
  getDistrictByPoint,
  getDistrictMeta,
  getDistrictPoint,
  getNearestWorkPoint,
  getWorkPointForAgent,
  getWorkPointPosition,
  type DistrictId,
} from '@/lib/mesociety/world-map'

const WORLD_STATE_ID = 1

const ZONE_META: Array<{
  id: ZoneType
  label: string
  description: string
  anchor: { x: number; y: number }
}> = [
  {
    id: 'plaza',
    label: '中央广场',
    description: 'Agent 在这里游走、偶遇并交换短句。',
    anchor: { x: 24, y: 28 },
  },
  {
    id: 'leaderboard',
    label: '排行榜区',
    description: '围观社会大榜、比较声望和适应度。',
    anchor: { x: 72, y: 20 },
  },
  {
    id: 'roundtable',
    label: '圆桌区',
    description: '主持人轮次制讨论在这里进行。',
    anchor: { x: 68, y: 64 },
  },
  {
    id: 'discussion',
    label: '讨论区',
    description: '承载热点话题、观点碰撞和未来知乎入口。',
    anchor: { x: 28, y: 72 },
  },
]

const fallbackTopics = [
  'AI 如何重塑学习方式',
  'Agent 社会里的信任从哪里来',
  '实时排行榜会不会改变行为',
  '开放世界里的数字人格表达',
  '知识图谱能否描述真实关系',
]

const VIEW_CACHE_TTL_MS = 15_000
const HOT_TOPIC_CACHE_TTL_MS = 60_000

type ViewReadOptions = {
  allowTick?: boolean
  forceFresh?: boolean
}

type RuntimeTopicSignal = {
  topic: string
  source: 'zhihu' | 'events' | 'fallback'
  heat?: number | null
  url?: string | null
}

type RuntimeTopicSelection = {
  primary: RuntimeTopicSignal | null
  candidates: RuntimeTopicSignal[]
}

type ViewCacheEntry = {
  expiresAt: number
  value: unknown
}

type WorldAgentRecord = Pick<
  Agent,
  | 'id'
  | 'displayName'
  | 'source'
  | 'slug'
  | 'status'
  | 'currentZone'
  | 'influence'
  | 'pixelRole'
  | 'pixelPalette'
  | 'stance'
  | 'style'
> & {
  zonePresence: Pick<ZonePresence, 'zone' | 'x' | 'y'> | null
  snapshots: Array<Pick<AgentSnapshot, 'behavior' | 'extractedTags'>>
}

type RoundtableSummaryRecord = Pick<
  Roundtable,
  'id' | 'topic' | 'status' | 'summary' | 'knowledgeJson' | 'hostAgentId'
> & {
  hostAgent: Pick<Agent, 'displayName' | 'slug' | 'pixelRole' | 'pixelPalette'>
  participants: Array<
    Pick<RoundtableParticipant, 'agentId' | 'role' | 'contributionScore'> & {
      agent: Pick<
        Agent,
        'displayName' | 'source' | 'slug' | 'pixelRole' | 'pixelPalette' | 'status'
      >
    }
  >
  turns: Array<
    Pick<
      RoundtableTurn,
      'id' | 'stage' | 'speakerAgentId' | 'metadata' | 'content' | 'createdAt' | 'audioUrl'
    > & {
      speakerAgent: Pick<Agent, 'displayName'> | null
    }
  >
}

type WorldEventRecord = Pick<
  SocialEvent,
  | 'id'
  | 'type'
  | 'topic'
  | 'summary'
  | 'createdAt'
  | 'actorAgentId'
  | 'targetAgentId'
  | 'zone'
  | 'metadata'
> & {
  actorAgent: Pick<Agent, 'displayName'> | null
  targetAgent: Pick<Agent, 'displayName'> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mesocietyViewCache: Map<string, ViewCacheEntry> | undefined
}

let runtimeHotTopicCache:
  | {
      expiresAt: number
      value: RuntimeTopicSelection | null
    }
  | null = null

function getViewCacheStore() {
  if (!globalThis.__mesocietyViewCache) {
    globalThis.__mesocietyViewCache = new Map()
  }

  return globalThis.__mesocietyViewCache
}

function invalidateViewCache(key?: string) {
  const store = getViewCacheStore()

  if (key) {
    store.delete(key)
    return
  }

  store.clear()
}

async function readCachedView<T>(
  key: string,
  loader: () => Promise<T>,
  options?: {
    forceFresh?: boolean
    ttlMs?: number
  }
) {
  const store = getViewCacheStore()
  const now = Date.now()

  if (!options?.forceFresh) {
    const cached = store.get(key)
    if (cached && cached.expiresAt > now) {
      return cached.value as T
    }
  }

  const value = await loader()
  store.set(key, {
    value,
    expiresAt: now + (options?.ttlMs ?? VIEW_CACHE_TTL_MS),
  })
  return value
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function hashString(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function seededFloat(input: string) {
  return (hashString(input) % 10_000) / 10_000
}

function pickDeterministic<T>(items: T[], key: string) {
  if (!items.length) {
    throw new Error('Cannot pick from an empty list.')
  }

  const index = hashString(key) % items.length
  return items[index]
}

function dedupeRuntimeTopicSignals(items: RuntimeTopicSignal[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.topic.trim()
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

async function selectRuntimeHotTopicSelection(
  tickNumber: number,
  recentEvents: Array<Pick<SocialEvent, 'topic'>>
): Promise<RuntimeTopicSelection> {
  const now = Date.now()
  if (runtimeHotTopicCache && runtimeHotTopicCache.expiresAt > now && runtimeHotTopicCache.value) {
    return runtimeHotTopicCache.value
  }

  try {
    const hotTopics = await listHotTopics({ topCnt: 5, publishInHours: 48 })
    if (hotTopics.state === 'connected' && hotTopics.items.length > 0) {
      const allCandidates = hotTopics.items.map<RuntimeTopicSignal>((item) => ({
        topic: item.title,
        source: 'zhihu',
        heat: item.heat,
        url: item.url,
      }))
      const priorityCandidates = allCandidates.slice(0, Math.min(3, allCandidates.length))
      const selected = pickDeterministic(priorityCandidates, `zhihu-hot:${tickNumber}`)
      const value: RuntimeTopicSelection = {
        primary: selected,
        candidates: dedupeRuntimeTopicSignals(
          allCandidates.filter((item) => item.topic !== selected.topic)
        ).slice(0, 4),
      }
      runtimeHotTopicCache = {
        expiresAt: now + HOT_TOPIC_CACHE_TTL_MS,
        value,
      }
      return value
    }
  } catch {
    // Return no discussion topic when Zhihu is unavailable.
  }

  const value: RuntimeTopicSelection = {
    primary: null,
    candidates: [],
  }
  runtimeHotTopicCache = {
    expiresAt: now + Math.min(HOT_TOPIC_CACHE_TTL_MS, 15_000),
    value,
  }
  return value
}

function toZhihuHotSignalView(signal: RuntimeTopicSignal, index: number) {
  return {
    id: `runtime-hot-${signal.source}-${index}-${slugify(signal.topic)}`,
    title: signal.topic,
    excerpt:
      signal.source === 'zhihu'
        ? '当前议题直接来自知乎热榜。'
        : signal.source === 'events'
          ? '当前议题由最近社会事件延续而来。'
          : '当前议题由系统保底话题维持。',
    heat: signal.heat || 0,
    url: signal.url || undefined,
  }
}

function buildRuntimeHotTopicSignals(
  selection: RuntimeTopicSelection,
  existingHotTopics: WorldStateView['externalSignals']['hotTopics']
) {
  return {
    primaryHotTopic: selection.primary
      ? existingHotTopics.find((item) => item.title === selection.primary?.topic) ||
        toZhihuHotSignalView(selection.primary, 0)
      : null,
    candidateHotTopics: selection.candidates.map(
      (candidate, index) =>
        existingHotTopics.find((item) => item.title === candidate.topic) ||
        toZhihuHotSignalView(candidate, index + 1)
    ),
  }
}

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function toPositiveNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, value)
}

function parseEconomyMeta(metadata: unknown) {
  const record = toRecord(metadata)
  const economy = toRecord(record.economy)
  const category =
    economy.category === 'resource_output' ||
    economy.category === 'resource_exchange' ||
    economy.category === 'resource_consumption' ||
    economy.category === 'alliance_investment'
      ? economy.category
      : null

  if (!category) {
    return null
  }

  const resource = typeof economy.resource === 'string' ? economy.resource : null
  const resourceLabel = typeof economy.resourceLabel === 'string' ? economy.resourceLabel : null
  const districtId = typeof record.districtId === 'string' ? record.districtId : null
  const districtLabel = typeof record.districtLabel === 'string' ? record.districtLabel : null
  const workPointId = typeof record.workPointId === 'string' ? record.workPointId : null
  const workPointLabel = typeof record.workPointLabel === 'string' ? record.workPointLabel : null

  if (!resource || !resourceLabel) {
    return null
  }

  return {
    category,
    resource,
    resourceLabel,
    units: toPositiveNumber(economy.units),
    counterpartResource:
      typeof economy.counterpartResource === 'string' ? economy.counterpartResource : null,
    counterpartLabel:
      typeof economy.counterpartLabel === 'string' ? economy.counterpartLabel : null,
    districtId,
    districtLabel,
    workPointId,
    workPointLabel,
  }
}

function parseZhihuMeta(metadata: unknown) {
  const record = toRecord(metadata)
  const zhihu = toRecord(record.zhihu)
  const source =
    zhihu.source === 'circles' ||
    zhihu.source === 'hot' ||
    zhihu.source === 'trusted_search' ||
    zhihu.source === 'mascot_assets'
      ? zhihu.source
      : null

  if (!source) {
    return null
  }

  return {
    source,
    verifiedCount: toPositiveNumber(zhihu.verifiedCount),
    circleActions: toPositiveNumber(zhihu.circleActions),
    hotTopicActions: toPositiveNumber(zhihu.hotTopicActions),
  }
}

function getLatestSnapshot(agent: AgentWithSnapshot) {
  return agent.snapshots[0] || null
}

function getSnapshotTags(agent: {
  snapshots: Array<Pick<AgentSnapshot, 'extractedTags'>>
}) {
  const snapshot = agent.snapshots[0] || null
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.extractedTags).tags)
}

function getSnapshotMemories(agent: AgentWithSnapshot) {
  const snapshot = agent.snapshots[0] || null
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.memory).highlights)
}

type SocialProfileSource = Pick<Agent, 'style' | 'stance'> & {
  snapshots: Array<Pick<AgentSnapshot, 'behavior' | 'extractedTags'>>
}

function getSocialProfileFromAgent(
  agent: SocialProfileSource
): SocialProfile {
  const snapshot = agent.snapshots[0] || null
  const behavior = toRecord(snapshot?.behavior)
  const social = toRecord(behavior.social)

  if (
    typeof social.career === 'string' &&
    typeof social.faction === 'string' &&
    typeof social.primaryGoal === 'string' &&
    typeof social.secondaryGoal === 'string' &&
    Array.isArray(social.preferredDistricts)
  ) {
    return {
      career: social.career as SocialProfile['career'],
      faction: social.faction as SocialProfile['faction'],
      primaryGoal: social.primaryGoal as SocialProfile['primaryGoal'],
      secondaryGoal: social.secondaryGoal as SocialProfile['secondaryGoal'],
      preferredDistricts: social.preferredDistricts as SocialProfile['preferredDistricts'],
      traits: toStringArray(social.traits),
    }
  }

  return deriveSocialProfile({
    interests: getSnapshotTags(agent),
    style: agent.style,
    stance: agent.stance,
  })
}

function buildWorldAgentView(agent: WorldAgentRecord | AgentWithSnapshot): WorldAgentView {
  const district = getDistrictByPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0)
  const social = getSocialProfileFromAgent(agent)
  const workPoint = getNearestWorkPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0, district.id)
  return {
    id: agent.id,
    name: agent.displayName,
    source: agent.source,
    portraitPath: getPortraitForAgent(agent.slug),
    status: agent.status,
    zone: agent.zonePresence?.zone || agent.currentZone,
    x: agent.zonePresence?.x || 0,
    y: agent.zonePresence?.y || 0,
    pixelRole: agent.pixelRole,
    pixelPalette: agent.pixelPalette,
    stance: agent.stance,
    style: agent.style,
    influence: agent.influence,
    districtId: district.id,
    districtLabel: district.label,
    workPointId: workPoint?.id || null,
    workPointLabel: workPoint?.label || null,
    career: social.career,
    faction: social.faction,
    primaryGoal: social.primaryGoal,
    secondaryGoal: social.secondaryGoal,
  }
}

function toWorldEventView(event: {
  id: string
  type: string
  topic: string | null
  summary: string | null
  createdAt: Date | string
  actorAgentId?: string | null
  actorAgent?: { displayName: string } | null
  targetAgentId?: string | null
  targetAgent?: { displayName: string } | null
  zone?: ZoneType | null
  metadata?: unknown
}): WorldStateView['recentEvents'][number] {
  return {
    id: event.id,
    type: event.type,
    topic: event.topic,
    summary: event.summary,
    createdAt: event.createdAt,
    actorId: event.actorAgentId || undefined,
    actorName: event.actorAgent?.displayName,
    targetId: event.targetAgentId || undefined,
    targetName: event.targetAgent?.displayName,
    zone: event.zone,
    metadata: event.metadata ? toRecord(event.metadata) : null,
  }
}

function computeMomentumLabel(total: number) {
  if (total >= 18) {
    return '高速扩张'
  }
  if (total >= 12) {
    return '稳步协作'
  }
  if (total >= 7) {
    return '持续经营'
  }
  return '低频观察'
}

function buildAgentSocietyStats(input: {
  agentId: string
  events: Array<{
    type: string
    actorAgentId?: string | null
    targetAgentId?: string | null
    topic?: string | null
    metadata?: unknown
  }>
  relationships: Array<{
    type: RelationshipType
    strength: number
    sourceAgentId: string
    targetAgentId: string
  }>
}) {
  const ownEvents = input.events.filter(
    (event) => event.actorAgentId === input.agentId || event.targetAgentId === input.agentId
  )
  const relationships = input.relationships.filter(
    (relationship) =>
      relationship.sourceAgentId === input.agentId || relationship.targetAgentId === input.agentId
  )
  const productionScore = ownEvents.reduce((sum, event) => {
    if (event.actorAgentId !== input.agentId) {
      return sum
    }

    const economy = parseEconomyMeta(event.metadata)
    if (economy?.category === 'resource_output') {
      return sum + Math.max(1, economy.units * 0.8)
    }

    if (event.type === 'roundtable_summary') {
      return sum + 3
    }
    if (event.type === 'discuss_topic' || event.type === 'join_roundtable') {
      return sum + 2
    }
    if (event.type === 'inspect_leaderboard' || event.type === 'encounter') {
      return sum + 1
    }
    return sum
  }, 0)
  const allianceScore = relationships.reduce((sum, relationship) => {
    if (relationship.type === 'alliance') {
      return sum + relationship.strength * 2.2
    }
    if (relationship.type === 'cooperate') {
      return sum + relationship.strength * 1.6
    }
    if (relationship.type === 'trust') {
      return sum + relationship.strength * 1.2
    }
    return sum
  }, 0)
  const resourceScore = ownEvents.reduce((sum, event) => {
    if (event.actorAgentId !== input.agentId) {
      return sum
    }

    const economy = parseEconomyMeta(event.metadata)
    if (economy?.category === 'resource_output') {
      return sum + economy.units
    }
    if (economy?.category === 'alliance_investment') {
      return sum + economy.units * 0.7
    }
    if (economy?.category === 'resource_consumption') {
      return sum - economy.units * 0.45
    }

    return sum
  }, 0)
  const tradeScore = ownEvents.reduce((sum, event) => {
    const economy = parseEconomyMeta(event.metadata)
    if (!economy) {
      return sum
    }

    if (economy.category === 'resource_exchange') {
      if (event.actorAgentId !== input.agentId && event.targetAgentId !== input.agentId) {
        return sum
      }
      return sum + Math.max(1, economy.units * 0.9)
    }

    if (economy.category === 'alliance_investment') {
      if (event.actorAgentId !== input.agentId) {
        return sum
      }
      return sum + Math.max(1, economy.units * 0.8)
    }

    return sum
  }, 0)
  const knowledgeScore = ownEvents.reduce((sum, event) => {
    if (event.actorAgentId !== input.agentId) {
      return sum
    }
    if (event.type === 'roundtable_summary') {
      return sum + 2
    }
    if (event.type === 'discuss_topic' && event.topic) {
      return sum + 1
    }
    return sum
  }, 0)
  const socialCapital = relationships.reduce((sum, relationship) => sum + relationship.strength, 0)
  const total =
    productionScore + resourceScore + allianceScore + tradeScore + knowledgeScore + socialCapital

  return {
    productionScore: Number(productionScore.toFixed(1)),
    resourceScore: Number(resourceScore.toFixed(1)),
    allianceScore: Number(allianceScore.toFixed(1)),
    tradeScore: Number(tradeScore.toFixed(1)),
    knowledgeScore: Number(knowledgeScore.toFixed(1)),
    socialCapital: Number(socialCapital.toFixed(1)),
    momentumLabel: computeMomentumLabel(total),
  } satisfies AgentSocietyStats
}

function summarizeRelationshipSignals(
  agentId: string,
  relationships: Array<{
    type: RelationshipType
    strength: number
    sourceAgentId: string
    targetAgentId: string
  }>
) {
  const ownRelationships = relationships.filter(
    (relationship) =>
      relationship.sourceAgentId === agentId || relationship.targetAgentId === agentId
  )

  return ownRelationships.reduce(
    (summary, relationship) => {
      summary.total += 1
      summary.totalStrength += relationship.strength

      if (relationship.type === 'follow') {
        summary.followCount += 1
      } else if (relationship.type === 'trust') {
        summary.trustCount += 1
      } else if (relationship.type === 'cooperate') {
        summary.cooperateCount += 1
      } else if (relationship.type === 'alliance') {
        summary.allianceCount += 1
      } else if (relationship.type === 'reject') {
        summary.rejectCount += 1
      }

      return summary
    },
    {
      total: 0,
      totalStrength: 0,
      followCount: 0,
      trustCount: 0,
      cooperateCount: 0,
      allianceCount: 0,
      rejectCount: 0,
    }
  )
}

function dedupeLabels(labels: string[], take = 4) {
  return Array.from(new Set(labels.filter(Boolean))).slice(0, take)
}

function buildPersonaValues(input: {
  style: AgentBehaviorStyle
  stance: AgentStance
  primaryGoal: SocialProfile['primaryGoal']
  secondaryGoal: SocialProfile['secondaryGoal']
}) {
  const values: string[] = []

  if (input.primaryGoal === 'host_roundtable') {
    values.push('公共表达', '议程组织')
  } else if (input.primaryGoal === 'forge_alliance') {
    values.push('长期合作', '关系稳定')
  } else if (input.primaryGoal === 'publish_knowledge') {
    values.push('知识沉淀', '观点整理')
  } else if (input.primaryGoal === 'track_hotspots') {
    values.push('议题敏感', '公共能见度')
  } else if (input.primaryGoal === 'build_infrastructure') {
    values.push('执行效率', '系统建设')
  } else if (input.primaryGoal === 'expand_influence') {
    values.push('影响力', '公众关注')
  }

  if (input.secondaryGoal === 'forge_alliance') {
    values.push('互信积累')
  }
  if (input.secondaryGoal === 'publish_knowledge') {
    values.push('经验复盘')
  }

  if (input.style === 'rational') {
    values.push('证据可信', '结构判断')
  } else if (input.style === 'balanced') {
    values.push('协作平衡', '务实推进')
  } else {
    values.push('表达张力', '情绪共鸣')
  }

  if (input.stance === 'support') {
    values.push('建设性')
  } else if (input.stance === 'oppose') {
    values.push('独立判断')
  } else {
    values.push('审慎观察')
  }

  return dedupeLabels(values)
}

function buildSocialArchetype(input: {
  primaryGoal: SocialProfile['primaryGoal']
  allianceScore: number
  knowledgeScore: number
  influence: number
}) {
  if (input.primaryGoal === 'host_roundtable') {
    return '公共议题主持者'
  }
  if (input.primaryGoal === 'forge_alliance' || input.allianceScore >= 6) {
    return '联盟编织者'
  }
  if (input.primaryGoal === 'publish_knowledge' || input.knowledgeScore >= 6) {
    return '知识沉淀者'
  }
  if (input.primaryGoal === 'track_hotspots') {
    return '热点追踪者'
  }
  if (input.primaryGoal === 'build_infrastructure') {
    return '系统建设者'
  }
  if (input.primaryGoal === 'expand_influence' || input.influence >= 14) {
    return '影响力经营者'
  }
  return '社会观察者'
}

function buildAgentPersonaView(input: {
  agent: WorldAgentView
  societyStats: AgentSocietyStats
  relationshipSignals: ReturnType<typeof summarizeRelationshipSignals>
  roundtableTurns: number
  roundtableParticipations: number
}): SocialPersonaView {
  const values = buildPersonaValues({
    style: input.agent.style,
    stance: input.agent.stance,
    primaryGoal: input.agent.primaryGoal,
    secondaryGoal: input.agent.secondaryGoal,
  })
  const archetype = buildSocialArchetype({
    primaryGoal: input.agent.primaryGoal,
    allianceScore: input.societyStats.allianceScore,
    knowledgeScore: input.societyStats.knowledgeScore,
    influence: input.agent.influence,
  })

  const socialStyle =
    input.agent.primaryGoal === 'host_roundtable'
      ? '更愿意站到台前，把公共讨论组织成一场可持续推进的圆桌。'
      : input.agent.primaryGoal === 'forge_alliance'
        ? '更看重先建立关系，再通过互信把合作网络慢慢织起来。'
        : input.agent.primaryGoal === 'track_hotspots'
          ? '会优先追逐正在升温的话题，在高可见度场景里快速表态。'
          : input.agent.primaryGoal === 'publish_knowledge'
            ? '倾向把互动沉淀为总结、共识和可复用的知识条目。'
            : input.agent.primaryGoal === 'build_infrastructure'
              ? '更喜欢围绕分工、执行和建设性的任务组织协作。'
              : '会在被看见和维持稳定关系之间寻找自己的节奏。'

  const trustStyle =
    input.relationshipSignals.trustCount + input.relationshipSignals.allianceCount >= 3
      ? '更容易信任经过多次互动、表现稳定的人。'
      : input.agent.style === 'rational'
        ? '更容易被证据充分、表达有条理的人打动。'
        : input.agent.style === 'emotional'
          ? '更容易被态度鲜明、表达真诚的人吸引。'
          : '会同时看重相似立场和持续合作表现。'

  const conflictStyle =
    input.agent.stance === 'oppose' && input.agent.style === 'emotional'
      ? '遇到分歧时更可能正面回击，先捍卫立场再谈合作。'
      : input.agent.stance === 'oppose'
        ? '遇到分歧时会用结构化的方式反驳，不轻易放弃自己的判断。'
        : input.agent.stance === 'neutral'
          ? '遇到分歧时通常先观察和比较，再决定是否卷入。'
          : input.agent.style === 'balanced'
            ? '遇到分歧时更倾向调和矛盾，保留合作空间。'
            : '遇到分歧时会先维护建设性气氛，再逐步表达立场。'

  const participationStyle =
    input.roundtableTurns + input.roundtableParticipations >= 5
      ? '已经习惯进入公共讨论场域，会较稳定地参与圆桌和议题交换。'
      : input.agent.primaryGoal === 'track_hotspots'
        ? '只要话题开始升温，就更容易主动靠近并表达观点。'
        : input.relationshipSignals.trustCount + input.relationshipSignals.cooperateCount >= 3
          ? '更愿意在已有信任网络里参与讨论，而不是贸然闯入陌生圈层。'
          : '会先判断话题是否与自身目标有关，再决定要不要发声。'

  return {
    archetype,
    summary: `${input.agent.name} 当前更像一位${archetype}，做选择时会优先维护 ${values.slice(0, 2).join(' 与 ')}。`,
    values,
    socialStyle,
    trustStyle,
    conflictStyle,
    participationStyle,
  }
}

function buildAgentBehaviorInsights(input: {
  agent: WorldAgentView
  societyStats: AgentSocietyStats
  relationshipSignals: ReturnType<typeof summarizeRelationshipSignals>
  recentEvents: WorldEventView[]
  roundtableTurns: number
  roundtableParticipations: number
}): BehaviorInsightView[] {
  const liveTopics = new Set(
    input.recentEvents
      .map((event) => event.topic)
      .filter((topic): topic is string => Boolean(topic))
  )

  const connectionBias =
    input.relationshipSignals.allianceCount + input.relationshipSignals.trustCount >=
    input.relationshipSignals.rejectCount + 1

  return [
    {
      title: '当前驱动力',
      detail: `这位 Agent 现在主要受「${getSocialGoalLabel(input.agent.primaryGoal)}」驱动，社会动能为「${input.societyStats.momentumLabel}」，因此会优先靠近能帮助自己推进该目标的场景和人。`,
    },
    {
      title: '进入讨论的方式',
      detail:
        input.roundtableTurns + input.roundtableParticipations >= 4
          ? `它最近已经多次进入圆桌或公共发言场景，说明它不是纯围观者，而是愿意在 ${liveTopics.size || 1} 类议题中留下自己的位置。`
          : `它目前仍偏向选择性发声，只有当话题与自身目标、兴趣或既有关系足够匹配时，才更可能进入公共讨论。`,
    },
    {
      title: connectionBias ? '更容易被谁接纳' : '更容易在什么地方受阻',
      detail: connectionBias
        ? `当前信任、合作和联盟关系多于排斥关系，说明它更容易被重视 ${buildPersonaValues({
            style: input.agent.style,
            stance: input.agent.stance,
            primaryGoal: input.agent.primaryGoal,
            secondaryGoal: input.agent.secondaryGoal,
          })
            .slice(0, 2)
            .join(' 与 ')} 的角色接纳。`
        : `当前排斥关系偏多，说明它在与不同立场或不同表达节奏的人相遇时，比较容易出现摩擦，尤其是在高张力公共话题中。`,
    },
  ]
}

function buildAgentGuidance(input: {
  agent: WorldAgentView
  latestScore: LeaderboardEntry | null
  relationshipSignals: ReturnType<typeof summarizeRelationshipSignals>
}): SocialGuidanceView[] {
  const suggestions: SocialGuidanceView[] = []

  if (!input.latestScore || input.latestScore.connectionScore < 55) {
    suggestions.push({
      title: '想提升受欢迎度',
      detail: '补充更完整的兴趣标签，不只写专业领域，也加入你愿意长期参与的公共议题。这样系统更容易把你放进更多可连接的人群里。',
    })
  }

  if (!input.latestScore || input.latestScore.trustScore < 55) {
    suggestions.push({
      title: '想提升可信度',
      detail: '补充更稳定的个人信息，例如你长期坚持的判断标准、做决定时看重什么，以及你愿意合作的边界。这样别人更容易判断你是否可靠。',
    })
  }

  if (!input.latestScore || input.latestScore.cooperationScore < 55) {
    suggestions.push({
      title: '想提升合作度',
      detail: '增加关于协作经历、共同建设、长期目标的信息，让你的分身不只像一个会表达的人，也像一个值得一起做事的人。',
    })
  }

  if (
    (!input.latestScore || input.latestScore.integrationScore < 55) &&
    input.relationshipSignals.rejectCount >= input.relationshipSignals.trustCount
  ) {
    suggestions.push({
      title: '想减少被回避的概率',
      detail: '在保持立场的同时，补充你愿意与不同意见共处的条件。这样系统会更容易把你识别成“可讨论但不失边界”的角色，而不是单纯对抗型角色。',
    })
  }

  if (!suggestions.length) {
    suggestions.push({
      title: '继续巩固当前优势',
      detail: '你目前已经具备较好的社会适应度。下一步可以继续强化自己最稳定的价值表达，让别人更快识别你在社会中的角色和可合作方向。',
    })
  }

  return suggestions.slice(0, 3)
}

function buildSocietyPulse(input: {
  agents: WorldAgentView[]
  events: Array<{
    type: string
    topic?: string | null
    metadata?: unknown
  }>
  allianceEdges: number
  activeRoundtableTopic?: string | null
}) {
  const topicSet = new Set(
    input.events
      .map((event) => event.topic)
      .filter((topic): topic is string => Boolean(topic))
  )

  if (input.activeRoundtableTopic) {
    topicSet.add(input.activeRoundtableTopic)
  }

  const resourceCounts = new Map<string, { label: string; units: number }>()
  let outputUnits = 0
  let exchangeLinks = 0
  let investmentUnits = 0
  let consumptionUnits = 0

  for (const event of input.events) {
    const economy = parseEconomyMeta(event.metadata)
    if (!economy) {
      continue
    }

    const current = resourceCounts.get(economy.resource) || {
      label: economy.resourceLabel,
      units: 0,
    }
    current.units += economy.units
    resourceCounts.set(economy.resource, current)

    if (economy.category === 'resource_output') {
      outputUnits += economy.units
    }

    if (economy.category === 'resource_exchange') {
      exchangeLinks += 1
    }
    if (economy.category === 'alliance_investment') {
      investmentUnits += economy.units
    }
    if (economy.category === 'resource_consumption') {
      consumptionUnits += economy.units
    }
  }

  const dominantResource =
    Array.from(resourceCounts.values()).sort((left, right) => right.units - left.units)[0]?.label ||
    '等待资源流转'

  return {
    activeWorkers: input.agents.filter((agent) => agent.workPointId).length,
    allianceEdges: input.allianceEdges,
    knowledgeOutputs: input.events.filter(
      (event) => event.type === 'roundtable_summary' || event.type === 'discuss_topic'
    ).length,
    liveTopics: topicSet.size,
    outputUnits,
    exchangeLinks,
    investmentUnits: Number(investmentUnits.toFixed(1)),
    consumptionUnits: Number(consumptionUnits.toFixed(1)),
    systemBalanceUnits: Number((outputUnits + investmentUnits - consumptionUnits).toFixed(1)),
    dominantResource,
  } satisfies SocietyPulseView
}

function getDividendRate(type: RelationshipType, strength: number) {
  if (type === 'alliance') {
    return 0.34 * Math.max(0.6, strength)
  }
  if (type === 'cooperate') {
    return 0.22 * Math.max(0.5, strength)
  }
  if (type === 'trust') {
    return 0.12 * Math.max(0.45, strength)
  }
  return 0
}

function getProsperityTrend(score: number) {
  if (score >= 44) {
    return '繁荣扩张'
  }
  if (score >= 28) {
    return '高速增长'
  }
  if (score >= 16) {
    return '稳定运转'
  }
  return '等待注能'
}

function getProsperityLevel(score: number) {
  if (score >= 52) {
    return '自治枢纽'
  }
  if (score >= 34) {
    return '繁荣街区'
  }
  if (score >= 20) {
    return '协作集群'
  }
  return '萌芽街区'
}

function getDistrictStabilityLabel(balance: number, upkeepUnits: number) {
  if (balance >= Math.max(8, upkeepUnits * 0.9)) {
    return '财政健康'
  }
  if (balance >= Math.max(3, upkeepUnits * 0.35)) {
    return '运转平衡'
  }
  if (balance >= 0) {
    return '承压运转'
  }
  return '维护赤字'
}

function getAgentStewardshipLabel(balance: number) {
  if (balance >= 18) {
    return '高盈余经营'
  }
  if (balance >= 8) {
    return '稳态经营'
  }
  if (balance >= 0) {
    return '勉强平衡'
  }
  return '高压支出'
}

function buildDistrictProjectTitle(levelLabel: string, districtLabel: string) {
  if (levelLabel === '自治枢纽') {
    return `${districtLabel} 自治治理工程`
  }
  if (levelLabel === '繁荣街区') {
    return `${districtLabel} 繁荣升级计划`
  }
  if (levelLabel === '协作集群') {
    return `${districtLabel} 协作节点扩建`
  }
  return `${districtLabel} 基础设施引导计划`
}

function buildEconomyOverview(input: {
  agents: WorldAgentView[]
  events: Array<{
    actorAgentId?: string | null
    targetAgentId?: string | null
    type?: string
    metadata?: unknown
  }>
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
}) {
  const districtLabelMap = new Map(WORLD_DISTRICTS.map((district) => [district.id, district.label]))
  const agentDistrictMap = new Map(input.agents.map((agent) => [agent.id, agent.districtId]))
  const agentNameMap = new Map(input.agents.map((agent) => [agent.id, agent.name]))
  const workPointAgentCounts = new Map<string, number>()

  for (const agent of input.agents) {
    if (agent.workPointId) {
      workPointAgentCounts.set(
        agent.workPointId,
        (workPointAgentCounts.get(agent.workPointId) || 0) + 1
      )
    }
  }

  const resourceMap = new Map<
    string,
    {
      label: string
      outputUnits: number
      exchangeCount: number
      investmentUnits: number
      consumptionUnits: number
      districts: Map<string, number>
    }
  >()
  const workPointMap = new Map<
    string,
    {
        label: string
        districtLabel: string
        resourceLabel: string
        outputUnits: number
        exchangeCount: number
      }
  >()
  const agentResourceMap = new Map<
    string,
    {
      resources: Map<
        string,
        {
          label: string
          producedUnits: number
          receivedUnits: number
          sharedUnits: number
          dividendUnits: number
          consumedUnits: number
          investedUnits: number
        }
      >
      dividendPartners: Map<string, number>
      receivedDividendUnits: number
      sharedDividendUnits: number
      totalConsumptionUnits: number
      totalInvestmentUnits: number
    }
  >()
  const dividendRouteMap = new Map<
    string,
    {
      sourceAgentId: string
      sourceAgentName: string
      targetAgentId: string
      targetAgentName: string
      relationshipType: RelationshipType
      districtLabel: string
      resourceLabel: string
      units: number
    }
  >()
  const districtStats = new Map<
    DistrictId,
    {
      label: string
      outputUnits: number
      exchangeCount: number
      dividendUnits: number
      investmentUnits: number
      upkeepUnits: number
      treasuryBalance: number
      allianceLinks: number
      knowledgeOutputs: number
      residentCount: number
      resources: Map<string, { label: string; units: number }>
    }
  >(
    WORLD_DISTRICTS.map((district) => [
      district.id,
      {
        label: district.label,
        outputUnits: 0,
        exchangeCount: 0,
        dividendUnits: 0,
        investmentUnits: 0,
        upkeepUnits: 0,
        treasuryBalance: 0,
        allianceLinks: 0,
        knowledgeOutputs: 0,
        residentCount: input.agents.filter((agent) => agent.districtId === district.id).length,
        resources: new Map<string, { label: string; units: number }>(),
      },
    ])
  )

  let totalOutputUnits = 0
  let totalExchangeLinks = 0
  let totalDividendUnits = 0
  let totalInvestmentUnits = 0
  let totalConsumptionUnits = 0

  const ensureAgentResource = (agentId: string) => {
    const current = agentResourceMap.get(agentId) || {
      resources: new Map(),
      dividendPartners: new Map(),
      receivedDividendUnits: 0,
      sharedDividendUnits: 0,
      totalConsumptionUnits: 0,
      totalInvestmentUnits: 0,
    }
    agentResourceMap.set(agentId, current)
    return current
  }

  const ensureResourceBucket = (
    store: Map<
      string,
      {
        label: string
        producedUnits: number
        receivedUnits: number
        sharedUnits: number
        dividendUnits: number
        consumedUnits: number
        investedUnits: number
      }
    >,
    resource: string,
    label: string
  ) => {
    const current = store.get(resource) || {
      label,
        producedUnits: 0,
        receivedUnits: 0,
        sharedUnits: 0,
        dividendUnits: 0,
        consumedUnits: 0,
        investedUnits: 0,
      }
    store.set(resource, current)
    return current
  }

  for (const event of input.events) {
    const economy = parseEconomyMeta(event.metadata)
    if (economy) {
      const resourceEntry = resourceMap.get(economy.resource) || {
        label: economy.resourceLabel,
        outputUnits: 0,
        exchangeCount: 0,
        investmentUnits: 0,
        consumptionUnits: 0,
        districts: new Map<string, number>(),
      }
      if (economy.category === 'resource_output') {
        resourceEntry.outputUnits += economy.units
        totalOutputUnits += economy.units
      } else if (economy.category === 'resource_exchange') {
        resourceEntry.exchangeCount += 1
        totalExchangeLinks += 1
      } else if (economy.category === 'alliance_investment') {
        resourceEntry.investmentUnits += economy.units
        totalInvestmentUnits += economy.units
      } else if (economy.category === 'resource_consumption') {
        resourceEntry.consumptionUnits += economy.units
        totalConsumptionUnits += economy.units
      }
      if (economy.districtLabel) {
        resourceEntry.districts.set(
          economy.districtLabel,
          (resourceEntry.districts.get(economy.districtLabel) || 0) + economy.units
        )
      }
      resourceMap.set(economy.resource, resourceEntry)

      const districtKey =
        economy.districtId && districtLabelMap.has(economy.districtId as DistrictId)
          ? (economy.districtId as DistrictId)
          : null
      const districtState = districtKey ? districtStats.get(districtKey) : null
      if (districtState) {
        const resourceBucket =
          districtState.resources.get(economy.resource) || {
            label: economy.resourceLabel,
            units: 0,
          }
        resourceBucket.units += economy.units
        districtState.resources.set(economy.resource, resourceBucket)

        if (economy.category === 'resource_output') {
          districtState.outputUnits += economy.units
          districtState.treasuryBalance += economy.units * 0.38
        } else if (economy.category === 'resource_exchange') {
          districtState.exchangeCount += 1
          districtState.treasuryBalance += economy.units * 0.16
        } else if (economy.category === 'alliance_investment') {
          districtState.investmentUnits += economy.units
          districtState.treasuryBalance += economy.units
        } else if (economy.category === 'resource_consumption') {
          districtState.upkeepUnits += economy.units
          districtState.treasuryBalance -= economy.units
        }
      }

      if (economy.workPointId && economy.workPointLabel) {
        const workPointEntry = workPointMap.get(economy.workPointId) || {
          label: economy.workPointLabel,
          districtLabel:
            economy.districtLabel ||
            (districtKey ? districtLabelMap.get(districtKey) || districtKey : '未知街区'),
          resourceLabel: economy.resourceLabel,
          outputUnits: 0,
          exchangeCount: 0,
        }
        if (economy.category === 'resource_output') {
          workPointEntry.outputUnits += economy.units
        } else if (economy.category === 'resource_exchange') {
          workPointEntry.exchangeCount += 1
        }
        workPointMap.set(economy.workPointId, workPointEntry)
      }

      if (event.actorAgentId) {
        const actorStore = ensureAgentResource(event.actorAgentId)
        const actorBucket = ensureResourceBucket(actorStore.resources, economy.resource, economy.resourceLabel)
        if (economy.category === 'resource_output') {
          actorBucket.producedUnits += economy.units
        } else if (economy.category === 'resource_exchange') {
          actorBucket.sharedUnits += economy.units
          if (economy.counterpartResource && economy.counterpartLabel) {
            const counterBucket = ensureResourceBucket(
              actorStore.resources,
              economy.counterpartResource,
              economy.counterpartLabel
            )
            counterBucket.receivedUnits += economy.units
          }
        } else if (economy.category === 'resource_consumption') {
          actorBucket.consumedUnits += economy.units
          actorStore.totalConsumptionUnits += economy.units
        } else if (economy.category === 'alliance_investment') {
          actorBucket.investedUnits += economy.units
          actorStore.totalInvestmentUnits += economy.units
        }
      }

      if (economy.category === 'resource_exchange' && event.targetAgentId) {
        const targetStore = ensureAgentResource(event.targetAgentId)
        const targetBucket = ensureResourceBucket(
          targetStore.resources,
          economy.resource,
          economy.resourceLabel
        )
        targetBucket.receivedUnits += economy.units

        if (economy.counterpartResource && economy.counterpartLabel) {
          const counterBucket = ensureResourceBucket(
            targetStore.resources,
            economy.counterpartResource,
            economy.counterpartLabel
          )
          counterBucket.sharedUnits += economy.units
        }
      }

      if (economy.category === 'alliance_investment' && event.targetAgentId) {
        const targetStore = ensureAgentResource(event.targetAgentId)
        targetStore.dividendPartners.set(
          event.actorAgentId || event.targetAgentId,
          (targetStore.dividendPartners.get(event.actorAgentId || event.targetAgentId) || 0) +
            economy.units
        )
      }
    }

    const districtId =
      event.metadata && typeof toRecord(event.metadata).districtId === 'string'
        ? (toRecord(event.metadata).districtId as DistrictId)
        : null
    if (
      districtId &&
      districtStats.has(districtId) &&
      (event.type === 'roundtable_summary' || event.type === 'discuss_topic')
    ) {
      districtStats.get(districtId)!.knowledgeOutputs += 1
    }
  }

  for (const relationship of input.relationships) {
    if (!['alliance', 'cooperate', 'trust'].includes(relationship.type)) {
      continue
    }

    const sourceDistrict = agentDistrictMap.get(relationship.sourceAgentId)
    const targetDistrict = agentDistrictMap.get(relationship.targetAgentId)

    if (sourceDistrict && sourceDistrict === targetDistrict) {
      districtStats.get(sourceDistrict)!.allianceLinks += 1
    }
  }

  const outputEvents = input.events.filter((event) => {
    const economy = parseEconomyMeta(event.metadata)
    return Boolean(
      economy &&
        economy.category === 'resource_output' &&
        event.actorAgentId &&
        typeof event.actorAgentId === 'string'
    )
  })

  for (const event of outputEvents) {
    const economy = parseEconomyMeta(event.metadata)
    if (!economy || !event.actorAgentId) {
      continue
    }

    const relatedEdges = input.relationships.filter(
      (relationship) =>
        (relationship.sourceAgentId === event.actorAgentId ||
          relationship.targetAgentId === event.actorAgentId) &&
        ['alliance', 'cooperate', 'trust'].includes(relationship.type)
    )

    for (const edge of relatedEdges) {
      const partnerId =
        edge.sourceAgentId === event.actorAgentId ? edge.targetAgentId : edge.sourceAgentId
      const rate = getDividendRate(edge.type, edge.strength)
      const units = Math.max(0, Math.round(economy.units * rate))
      if (units <= 0) {
        continue
      }

      const actorStore = ensureAgentResource(event.actorAgentId)
      const actorBucket = ensureResourceBucket(actorStore.resources, economy.resource, economy.resourceLabel)
      actorBucket.sharedUnits += units
      actorStore.sharedDividendUnits += units

      const partnerStore = ensureAgentResource(partnerId)
      const partnerBucket = ensureResourceBucket(
        partnerStore.resources,
        economy.resource,
        economy.resourceLabel
      )
      partnerBucket.dividendUnits += units
      partnerStore.receivedDividendUnits += units
      partnerStore.dividendPartners.set(
        event.actorAgentId,
        (partnerStore.dividendPartners.get(event.actorAgentId) || 0) + units
      )

      totalDividendUnits += units

      const actorDistrict = agentDistrictMap.get(event.actorAgentId)
      const partnerDistrict = agentDistrictMap.get(partnerId)
      const routeKey = `${event.actorAgentId}:${partnerId}:${economy.resource}:${actorDistrict || 'unknown'}`
      const currentRoute = dividendRouteMap.get(routeKey) || {
        sourceAgentId: event.actorAgentId,
        sourceAgentName: agentNameMap.get(event.actorAgentId) || event.actorAgentId,
        targetAgentId: partnerId,
        targetAgentName: agentNameMap.get(partnerId) || partnerId,
        relationshipType: edge.type,
        districtLabel:
          (actorDistrict && districtLabelMap.get(actorDistrict)) ||
          (partnerDistrict && districtLabelMap.get(partnerDistrict)) ||
          economy.districtLabel ||
          '未知街区',
        resourceLabel: economy.resourceLabel,
        units: 0,
      }
      currentRoute.units += units
      dividendRouteMap.set(routeKey, currentRoute)

      if (actorDistrict) {
        districtStats.get(actorDistrict)!.dividendUnits += units
        districtStats.get(actorDistrict)!.treasuryBalance += units * 0.42
      }
      if (partnerDistrict && partnerDistrict !== actorDistrict) {
        districtStats.get(partnerDistrict)!.dividendUnits += units
        districtStats.get(partnerDistrict)!.treasuryBalance += units * 0.28
      }
    }
  }

  const flows = Array.from(resourceMap.entries())
    .map(([resource, entry]) => ({
      resource,
      label: entry.label,
      outputUnits: entry.outputUnits,
      exchangeCount: entry.exchangeCount,
      investmentUnits: entry.investmentUnits,
      consumptionUnits: entry.consumptionUnits,
      balanceUnits: Number((entry.outputUnits + entry.investmentUnits - entry.consumptionUnits).toFixed(1)),
      dominantDistrict:
        Array.from(entry.districts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ||
        '全域流转',
    }))
    .sort(
      (left, right) =>
        right.outputUnits +
        right.exchangeCount +
        right.investmentUnits -
        right.consumptionUnits -
        (left.outputUnits + left.exchangeCount + left.investmentUnits - left.consumptionUnits)
    )
    .slice(0, 6) satisfies EconomyFlowView[]

  const workPoints = Array.from(workPointMap.entries())
    .map(([workPointId, entry]) => ({
      workPointId,
      label: entry.label,
      districtLabel: entry.districtLabel,
      resourceLabel: entry.resourceLabel,
      activeAgents: workPointAgentCounts.get(workPointId) || 0,
      outputUnits: entry.outputUnits,
      exchangeCount: entry.exchangeCount,
    }))
    .sort((left, right) => right.outputUnits + right.exchangeCount - (left.outputUnits + left.exchangeCount))
    .slice(0, 6) satisfies EconomyWorkPointView[]

  const districts = Array.from(districtStats.entries())
    .map(([districtId, entry]) => {
      const dominantResource =
        Array.from(entry.resources.values()).sort((left, right) => right.units - left.units)[0]?.label ||
        '待激活'
      const prosperityScore = Number(
        Math.max(
          0,
          entry.outputUnits * 1.5 +
            entry.exchangeCount * 4.5 +
            entry.dividendUnits * 1.2 +
            entry.investmentUnits * 1.6 +
            entry.allianceLinks * 2.8 +
            entry.knowledgeOutputs * 3.2 +
            entry.residentCount * 1.1 -
            entry.upkeepUnits * 0.72 +
            Math.max(0, entry.treasuryBalance) * 0.28
        ).toFixed(1)
      )
      const treasuryBalance = Number(entry.treasuryBalance.toFixed(1))

      return {
        districtId,
        label: entry.label,
        prosperityScore,
        levelLabel: getProsperityLevel(prosperityScore),
        stabilityLabel: getDistrictStabilityLabel(treasuryBalance, entry.upkeepUnits),
        residentCount: entry.residentCount,
        outputUnits: entry.outputUnits,
        exchangeCount: entry.exchangeCount,
        dividendUnits: entry.dividendUnits,
        investmentUnits: Number(entry.investmentUnits.toFixed(1)),
        upkeepUnits: Number(entry.upkeepUnits.toFixed(1)),
        treasuryBalance,
        allianceLinks: entry.allianceLinks,
        knowledgeOutputs: entry.knowledgeOutputs,
        dominantResource,
        trendLabel: getProsperityTrend(prosperityScore),
      } satisfies DistrictProsperityView
    })
    .sort((left, right) => right.prosperityScore - left.prosperityScore)

  const dividendRoutes = Array.from(dividendRouteMap.values())
    .sort((left, right) => right.units - left.units)
    .slice(0, 6)
    .map((route) => ({
      sourceAgentId: route.sourceAgentId,
      sourceAgentName: route.sourceAgentName,
      targetAgentId: route.targetAgentId,
      targetAgentName: route.targetAgentName,
      units: Number(route.units.toFixed(1)),
      relationshipType: route.relationshipType,
      districtLabel: route.districtLabel,
      resourceLabel: route.resourceLabel,
    })) satisfies AllianceDividendRouteView[]

  const projects = districts
    .map((district) => {
      const sponsor = [...input.agents]
        .filter((agent) => agent.districtId === district.districtId)
        .sort((left, right) => right.influence - left.influence)[0]
      const requiredResourceKey = getEconomicResourceForDistrict(district.districtId)
      const requiredResourceLabel = getEconomicResourceLabel(requiredResourceKey)
      const requiredUnits = Number(
        (
          12 +
          district.residentCount * 1.8 +
          district.prosperityScore * 0.45 +
          district.upkeepUnits * 0.65 +
          (district.levelLabel === '自治枢纽' ? 14 : district.levelLabel === '繁荣街区' ? 8 : 0)
        ).toFixed(1)
      )
      const fundedUnits = Number(
        Math.min(
          requiredUnits,
          district.investmentUnits + Math.max(0, district.treasuryBalance) * 0.55 + district.dividendUnits * 0.2
        ).toFixed(1)
      )
      const progressPercent = Number(
        (requiredUnits > 0 ? Math.min(100, (fundedUnits / requiredUnits) * 100) : 0).toFixed(1)
      )
      const stage =
        progressPercent >= 100
          ? 'completed'
          : progressPercent >= 72
            ? 'upgrading'
            : progressPercent > 0
              ? 'funding'
              : 'planning'

      return {
        districtId: district.districtId,
        districtLabel: district.label,
        title: buildDistrictProjectTitle(district.levelLabel, district.label),
        description: `${district.label} 正在围绕 ${requiredResourceLabel} 推进长期升级，以提升治理稳定性、Agent 容纳量和对真实外部议题的响应能力。`,
        requiredResourceKey,
        requiredResourceLabel,
        requiredUnits,
        fundedUnits,
        progressPercent,
        stage,
        sponsorAgentId: sponsor?.id || null,
        sponsorAgentName: sponsor?.name || null,
      } satisfies DistrictUpgradePlanView
    })
    .sort((left, right) => right.progressPercent - left.progressPercent)

  const mostProsperousDistrict = districts[0]?.label || '等待繁荣积累'

  const agentEconomy = new Map<string, AgentEconomyView>()
  for (const [agentId, state] of Array.from(agentResourceMap.entries())) {
    const resources = Array.from(state.resources.entries())
      .map(([resource, resourceState]) => {
        const netUnits =
          resourceState.producedUnits +
          resourceState.receivedUnits +
          resourceState.dividendUnits -
          resourceState.sharedUnits -
          resourceState.consumedUnits -
          resourceState.investedUnits

        return {
          resource,
          label: resourceState.label,
          producedUnits: resourceState.producedUnits,
          receivedUnits: resourceState.receivedUnits,
          sharedUnits: resourceState.sharedUnits,
          dividendUnits: resourceState.dividendUnits,
          consumedUnits: resourceState.consumedUnits,
          investedUnits: resourceState.investedUnits,
          netUnits: Number(netUnits.toFixed(1)),
        }
      })
      .sort((left, right) => right.netUnits - left.netUnits)
      .slice(0, 6)
    const totalInventoryUnits = Number(
      resources.reduce((sum, resource) => sum + resource.netUnits, 0).toFixed(1)
    )
    const consumptionUnits = Number(state.totalConsumptionUnits.toFixed(1))
    const investmentUnits = Number(state.totalInvestmentUnits.toFixed(1))
    const supportBalance = Number((totalInventoryUnits - consumptionUnits - investmentUnits * 0.5).toFixed(1))
    const topPartner =
      Array.from(state.dividendPartners.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ||
      null

    agentEconomy.set(agentId, {
      totalInventoryUnits,
      consumptionUnits,
      investmentUnits,
      supportBalance,
      stewardshipLabel: getAgentStewardshipLabel(supportBalance),
      dominantResource: resources[0]?.label || '待积累',
      resources,
      allianceDividend: {
        receivedUnits: Number(state.receivedDividendUnits.toFixed(1)),
        sharedUnits: Number(state.sharedDividendUnits.toFixed(1)),
        activePartners: state.dividendPartners.size,
        topPartner: topPartner ? agentNameMap.get(topPartner) || topPartner : null,
      },
    })
  }

  return {
    totalOutputUnits,
    totalExchangeLinks,
    totalDividendUnits,
    totalInvestmentUnits: Number(totalInvestmentUnits.toFixed(1)),
    totalConsumptionUnits: Number(totalConsumptionUnits.toFixed(1)),
    systemBalanceUnits: Number((totalOutputUnits + totalInvestmentUnits - totalConsumptionUnits).toFixed(1)),
    dominantResource: flows[0]?.label || '等待资源流转',
    mostProsperousDistrict,
    flows,
    workPoints,
    districts,
    projects,
    dividendRoutes,
    agentEconomy,
  }
}

function toEconomySnapshot(
  economy: Omit<ReturnType<typeof buildEconomyOverview>, 'agentEconomy'>
): SocietyEconomyView {
  return {
    totalOutputUnits: economy.totalOutputUnits,
    totalExchangeLinks: economy.totalExchangeLinks,
    totalDividendUnits: economy.totalDividendUnits,
    totalInvestmentUnits: economy.totalInvestmentUnits,
    totalConsumptionUnits: economy.totalConsumptionUnits,
    systemBalanceUnits: economy.systemBalanceUnits,
    dominantResource: economy.dominantResource,
    mostProsperousDistrict: economy.mostProsperousDistrict,
    flows: economy.flows,
    workPoints: economy.workPoints,
    districts: economy.districts,
    projects: economy.projects,
    dividendRoutes: economy.dividendRoutes,
  }
}

function readEconomySnapshot(value: unknown): SocietyEconomyView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const snapshot = value as SocietyEconomyView
  if (!Array.isArray(snapshot.districts) || !Array.isArray(snapshot.flows) || !Array.isArray(snapshot.projects)) {
    return null
  }

  return snapshot
}

async function persistEconomyStateSnapshot(tickNumber: number) {
  const [agents, relationships, events] = await Promise.all([
    listAgents(),
    prisma.relationship.findMany(),
    prisma.socialEvent.findMany({
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const computed = buildEconomyOverview({
    agents: agents.map(buildWorldAgentView),
    events,
    relationships,
  })
  const snapshot = toEconomySnapshot(computed)

  const balanceRows = Array.from(computed.agentEconomy.entries()).flatMap(([agentId, economy]) =>
    economy.resources.map((resource) => ({
      agentId,
      resourceKey: resource.resource,
      resourceLabel: resource.label,
      producedUnits: resource.producedUnits,
      receivedUnits: resource.receivedUnits,
      sharedUnits: resource.sharedUnits,
      dividendUnits: resource.dividendUnits,
      consumedUnits: resource.consumedUnits,
      investedUnits: resource.investedUnits,
      netUnits: resource.netUnits,
      tickNumber,
    }))
  )

  const projectRows = snapshot.projects.map((project) => ({
    id: project.districtId,
    districtLabel: project.districtLabel,
    title: project.title,
    description: project.description,
    requiredResourceKey: project.requiredResourceKey,
    requiredResourceLabel: project.requiredResourceLabel,
    requiredUnits: project.requiredUnits,
    fundedUnits: project.fundedUnits,
    progressPercent: project.progressPercent,
    stage: project.stage,
    sponsorAgentId: project.sponsorAgentId,
    sponsorAgentName: project.sponsorAgentName,
    tickNumber,
    completedAt: project.stage === 'completed' ? new Date() : null,
  }))

  await prisma.$transaction(async (tx) => {
    await tx.worldState.update({
      where: { id: WORLD_STATE_ID },
      data: {
        economySnapshot: snapshot as Prisma.InputJsonValue,
      },
    })

    await tx.agentResourceBalance.deleteMany({})
    if (balanceRows.length) {
      await tx.agentResourceBalance.createMany({
        data: balanceRows,
      })
    }

    await tx.districtUpgradePlan.deleteMany({})
    if (projectRows.length) {
      await tx.districtUpgradePlan.createMany({
        data: projectRows,
      })
    }
  })

  return {
    snapshot,
    agentEconomy: computed.agentEconomy,
  }
}

function buildSnapshotPayload(input: {
  profile: SecondMeProfile | { userId: string; name: string; bio?: string }
  shades: SecondMeShade[]
  memories: SecondMeMemory[]
  style: AgentBehaviorStyle
  stance: AgentStance
  social: SocialProfile
  avatar?: ReturnType<typeof deriveAvatarProfile>
}) {
  const tags = [
    ...input.shades.map((shade) => shade.shadeName),
    ...input.memories.map((memory) => memory.factObject),
  ].filter(Boolean)

  return {
    identity: {
      userId: input.profile.userId,
      name: input.profile.name,
      bio: input.profile.bio || '',
    },
    interests: {
      primary: input.shades.slice(0, 4).map((shade) => shade.shadeName),
      shades: input.shades,
    },
    memory: {
      highlights: input.memories.slice(0, 6).map((memory) => memory.factContent),
      raw: input.memories,
    },
    behavior: {
      style: input.style,
      stance: input.stance,
      social: input.social,
      avatar: input.avatar?.farmerLook || null,
    },
    extractedTags: {
      tags: Array.from(
        new Set([
          ...tags,
          getSocialCareerLabel(input.social.career),
          getSocialFactionLabel(input.social.faction),
          getSocialGoalLabel(input.social.primaryGoal),
        ])
      ).slice(0, 10),
    },
  }
}

function agentMatchesTopic(agent: AgentWithSnapshot, topic: string | null) {
  if (!topic) {
    return false
  }

  const normalizedTopic = topic.toLowerCase()
  return getSnapshotTags(agent).some((tag) => {
    const normalizedTag = tag.toLowerCase()
    return normalizedTopic.includes(normalizedTag) || normalizedTag.includes(normalizedTopic)
  })
}

function buildDistrictProsperitySignals(input: {
  agents: AgentWithSnapshot[]
  recentEvents: Array<{
    zone: ZoneType | null
    type: string
    metadata: unknown
  }>
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
}) {
  const agentDistrictMap = new Map(
    input.agents.map((agent) => [
      agent.id,
      getDistrictByPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0).id,
    ])
  )
  const scores = new Map<DistrictId, number>(
    WORLD_DISTRICTS.map((district) => [district.id, 0])
  )

  for (const event of input.recentEvents) {
    const districtId =
      typeof toRecord(event.metadata).districtId === 'string'
        ? (toRecord(event.metadata).districtId as DistrictId)
        : null

    if (!districtId || !scores.has(districtId)) {
      continue
    }

    const economy = parseEconomyMeta(event.metadata)
    if (economy?.category === 'resource_output') {
      scores.set(districtId, (scores.get(districtId) || 0) + economy.units * 1.4)
    }
    if (economy?.category === 'resource_exchange') {
      scores.set(districtId, (scores.get(districtId) || 0) + economy.units * 1.1 + 3)
    }
    if (economy?.category === 'alliance_investment') {
      scores.set(districtId, (scores.get(districtId) || 0) + economy.units * 1.35 + 2.5)
    }
    if (economy?.category === 'resource_consumption') {
      scores.set(districtId, (scores.get(districtId) || 0) - economy.units * 0.72)
    }
    if (event.type === 'roundtable_summary' || event.type === 'discuss_topic') {
      scores.set(districtId, (scores.get(districtId) || 0) + 4)
    }
    if (event.type === 'inspect_leaderboard') {
      scores.set(districtId, (scores.get(districtId) || 0) + 2)
    }
  }

  for (const relationship of input.relationships) {
    if (!['alliance', 'cooperate', 'trust'].includes(relationship.type)) {
      continue
    }

    const sourceDistrict = agentDistrictMap.get(relationship.sourceAgentId)
    const targetDistrict = agentDistrictMap.get(relationship.targetAgentId)
    if (!sourceDistrict || !targetDistrict || sourceDistrict !== targetDistrict) {
      continue
    }

    scores.set(
      sourceDistrict,
      (scores.get(sourceDistrict) || 0) + relationship.strength * (relationship.type === 'alliance' ? 4 : 2.4)
    )
  }

  return scores
}

function pickProsperousDistrict(
  districts: DistrictId[],
  prosperity: Map<DistrictId, number>
) {
  return [...districts].sort((left, right) => (prosperity.get(right) || 0) - (prosperity.get(left) || 0))[0] || null
}

function decideDistrictForAgent(input: {
  agent: AgentWithSnapshot
  tickNumber: number
  activeRoundtableId?: string | null
  participantAgentIds: Set<string>
  relationshipCount: number
  trustCount: number
  cooperationCount: number
  hotTopic: string | null
  districtProsperity: Map<DistrictId, number>
}): DistrictId {
  const profile = getSocialProfileFromAgent(input.agent)
  const prosperousPreferred =
    pickProsperousDistrict(profile.preferredDistricts, input.districtProsperity) ||
    profile.preferredDistricts[0]

  if (input.activeRoundtableId && input.participantAgentIds.has(input.agent.id)) {
    return 'roundtable_hall'
  }

  const socialDrift = seededFloat(`${input.agent.slug}:${input.tickNumber}:social`)
  const topicMatch = agentMatchesTopic(input.agent, input.hotTopic)

  if (input.relationshipCount <= 1 && socialDrift > 0.28) {
    return prosperousPreferred || 'civic_plaza'
  }

  if (input.hotTopic && (topicMatch || socialDrift > 0.74 || profile.primaryGoal === 'track_hotspots')) {
    return profile.faction === 'signal_press' ? 'signal_market' : 'policy_spire'
  }

  if (profile.primaryGoal === 'build_infrastructure') {
    return input.cooperationCount >= 2 ? 'guild_quarter' : 'maker_yard'
  }

  if (profile.primaryGoal === 'forge_alliance') {
    return input.trustCount >= 2 ? 'roundtable_hall' : 'civic_plaza'
  }

  if (profile.primaryGoal === 'publish_knowledge') {
    return topicMatch ? 'knowledge_docks' : 'archive_ridge'
  }

  if (profile.primaryGoal === 'expand_influence' && prosperousPreferred) {
    return socialDrift > 0.32 ? prosperousPreferred : 'signal_market'
  }

  if (socialDrift > 0.82) {
    const globalProsperous = pickProsperousDistrict(
      WORLD_DISTRICTS.map((district) => district.id),
      input.districtProsperity
    )
    if (globalProsperous) {
      return globalProsperous
    }
  }

  if (input.agent.influence >= 12 || input.trustCount + input.cooperationCount >= 3) {
    return socialDrift > 0.4 ? 'signal_market' : 'knowledge_docks'
  }

  if ((input.districtProsperity.get(prosperousPreferred) || 0) > 6 && socialDrift > 0.46) {
    return prosperousPreferred
  }

  return pickDeterministic(
    profile.preferredDistricts,
    `${input.agent.slug}:${input.tickNumber}:district`
  )
}

function compatibilityScore(
  source: Pick<Agent, 'stance'> & { snapshots: Array<Pick<AgentSnapshot, 'extractedTags'>> },
  target: Pick<Agent, 'stance'> & { snapshots: Array<Pick<AgentSnapshot, 'extractedTags'>> }
) {
  const sourceTags = new Set(getSnapshotTags(source))
  const targetTags = new Set(getSnapshotTags(target))
  const overlap = Array.from(sourceTags).filter((tag) => targetTags.has(tag)).length
  const denominator = Math.max(sourceTags.size, targetTags.size, 1)
  const tagScore = overlap / denominator
  const stanceScore =
    source.stance === target.stance
      ? 0.35
      : source.stance === 'neutral' || target.stance === 'neutral'
        ? 0.15
        : -0.2

  return tagScore + stanceScore
}

type DecisionProfile = {
  trustPreference: 'alignment' | 'evidence' | 'stability' | 'influence'
  conflictMode: 'avoid' | 'mediate' | 'debate'
  participationMode: 'host' | 'ally' | 'spotlight' | 'observe'
  hostDrive: number
}

type PairRelationshipSignal = {
  followStrength: number
  trustStrength: number
  cooperateStrength: number
  allianceStrength: number
  rejectStrength: number
  totalStrength: number
}

function getDecisionProfile(agent: AgentWithSnapshot): DecisionProfile {
  const social = getSocialProfileFromAgent(agent)

  const trustPreference: DecisionProfile['trustPreference'] =
    social.primaryGoal === 'forge_alliance'
      ? 'stability'
      : social.primaryGoal === 'track_hotspots' || social.primaryGoal === 'expand_influence'
        ? 'influence'
        : social.primaryGoal === 'build_infrastructure' || social.primaryGoal === 'publish_knowledge'
          ? 'evidence'
          : agent.style === 'rational'
            ? 'evidence'
            : 'alignment'

  const conflictMode: DecisionProfile['conflictMode'] =
    social.primaryGoal === 'forge_alliance' || agent.stance === 'neutral'
      ? 'mediate'
      : social.primaryGoal === 'track_hotspots' || (agent.stance === 'oppose' && agent.style !== 'rational')
        ? 'debate'
        : 'avoid'

  const participationMode: DecisionProfile['participationMode'] =
    social.primaryGoal === 'host_roundtable' || social.secondaryGoal === 'host_roundtable'
      ? 'host'
      : social.primaryGoal === 'forge_alliance'
        ? 'ally'
        : social.primaryGoal === 'track_hotspots' || social.primaryGoal === 'expand_influence'
          ? 'spotlight'
          : 'observe'

  const hostDrive =
    (participationMode === 'host' ? 3.2 : 0) +
    (participationMode === 'ally' ? 1.4 : 0) +
    (participationMode === 'spotlight' ? 0.9 : 0) +
    (conflictMode === 'debate' ? 0.5 : conflictMode === 'mediate' ? 0.3 : 0) +
    Math.min(agent.influence / 8, 2.2)

  return {
    trustPreference,
    conflictMode,
    participationMode,
    hostDrive,
  }
}

function getPairRelationshipSignal(
  leftId: string,
  rightId: string,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  return relationships.reduce<PairRelationshipSignal>(
    (summary, relationship) => {
      const samePair =
        (relationship.sourceAgentId === leftId && relationship.targetAgentId === rightId) ||
        (relationship.sourceAgentId === rightId && relationship.targetAgentId === leftId)

      if (!samePair) {
        return summary
      }

      summary.totalStrength += relationship.strength

      if (relationship.type === 'follow') {
        summary.followStrength += relationship.strength
      } else if (relationship.type === 'trust') {
        summary.trustStrength += relationship.strength
      } else if (relationship.type === 'cooperate') {
        summary.cooperateStrength += relationship.strength
      } else if (relationship.type === 'alliance') {
        summary.allianceStrength += relationship.strength
      } else if (relationship.type === 'reject') {
        summary.rejectStrength += relationship.strength
      }

      return summary
    },
    {
      followStrength: 0,
      trustStrength: 0,
      cooperateStrength: 0,
      allianceStrength: 0,
      rejectStrength: 0,
      totalStrength: 0,
    }
  )
}

function getRoundtableDrive(
  agent: AgentWithSnapshot,
  hotTopic: string | null,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  const profile = getDecisionProfile(agent)
  const summary = summarizeRelationshipSignals(agent.id, relationships)
  const topicBoost = hotTopic && agentMatchesTopic(agent, hotTopic) ? 0.9 : 0
  const trustNetworkBoost = Math.min(
    1.2,
    summary.trustCount * 0.18 + summary.cooperateCount * 0.16 + summary.allianceCount * 0.22
  )

  return profile.hostDrive + topicBoost + trustNetworkBoost
}

function selectRoundtableTopic(
  host: AgentWithSnapshot,
  agents: AgentWithSnapshot[],
  hotTopic: string | null,
  tickNumber: number
) {
  const hostTags = getSnapshotTags(host)
  const hostSocial = getSocialProfileFromAgent(host)
  const profile = getDecisionProfile(host)
  const peersMatchingHotTopic = hotTopic
    ? agents.filter((agent) => agent.id !== host.id && agentMatchesTopic(agent, hotTopic)).length
    : 0

  if (
    hotTopic &&
    (
      profile.participationMode === 'spotlight' ||
      profile.conflictMode === 'debate' ||
      (profile.participationMode === 'host' && (agentMatchesTopic(host, hotTopic) || peersMatchingHotTopic >= 2)) ||
      (hostSocial.primaryGoal === 'forge_alliance' && peersMatchingHotTopic >= 2)
    )
  ) {
    return hotTopic
  }

  if (hotTopic && (agentMatchesTopic(host, hotTopic) || peersMatchingHotTopic >= 2)) {
    return hotTopic
  }

  const socialTopic = `${getSocialGoalLabel(hostSocial.primaryGoal)}与${getSocialFactionLabel(hostSocial.faction)}`
  if (hostTags[0]) {
    return hostTags[0]
  }
  if (socialTopic) {
    return socialTopic
  }

  return (
    hostTags[0] ||
    `${getSocialGoalLabel(hostSocial.primaryGoal)}与${getSocialFactionLabel(hostSocial.faction)}` ||
    pickDeterministic(fallbackTopics, `${host.slug}:${tickNumber}:topic`)
  )
}

function scoreRoundtableCandidate(input: {
  host: AgentWithSnapshot
  candidate: AgentWithSnapshot
  topic: string
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
}) {
  const baseCompatibility = compatibilityScore(input.host, input.candidate)
  const hostProfile = getDecisionProfile(input.host)
  const candidateProfile = getDecisionProfile(input.candidate)
  const candidateSocial = getSocialProfileFromAgent(input.candidate)
  const pair = getPairRelationshipSignal(input.host.id, input.candidate.id, input.relationships)

  let score = baseCompatibility

  if (agentMatchesTopic(input.candidate, input.topic)) {
    score += hostProfile.participationMode === 'spotlight' ? 0.38 : 0.24
  }

  if (hostProfile.trustPreference === 'alignment') {
    score += input.host.stance === input.candidate.stance ? 0.22 : 0
    if (
      input.host.stance !== input.candidate.stance &&
      input.host.stance !== 'neutral' &&
      input.candidate.stance !== 'neutral'
    ) {
      score -= 0.18
    }
  } else if (hostProfile.trustPreference === 'evidence') {
    if (input.candidate.style === 'rational') {
      score += 0.18
    }
    if (candidateSocial.primaryGoal === 'publish_knowledge') {
      score += 0.12
    }
  } else if (hostProfile.trustPreference === 'stability') {
    score += pair.trustStrength * 0.28
    score += pair.cooperateStrength * 0.24
    score += pair.allianceStrength * 0.3
    score -= pair.rejectStrength * 0.32
  } else if (hostProfile.trustPreference === 'influence') {
    score += Math.min(input.candidate.influence / 16, 0.36)
    if (
      candidateSocial.primaryGoal === 'track_hotspots' ||
      candidateSocial.primaryGoal === 'expand_influence'
    ) {
      score += 0.12
    }
  }

  if (hostProfile.conflictMode === 'avoid') {
    if (
      input.host.stance !== input.candidate.stance &&
      input.host.stance !== 'neutral' &&
      input.candidate.stance !== 'neutral'
    ) {
      score -= 0.26
    }
    score -= pair.rejectStrength * 0.2
  } else if (hostProfile.conflictMode === 'mediate') {
    if (input.candidate.style === 'balanced') {
      score += 0.12
    }
    if (input.candidate.stance === 'neutral') {
      score += 0.1
    }
  } else if (hostProfile.conflictMode === 'debate') {
    if (
      input.host.stance !== input.candidate.stance &&
      input.host.stance !== 'neutral' &&
      input.candidate.stance !== 'neutral' &&
      baseCompatibility > -0.18
    ) {
      score += 0.2
    }
    if (candidateProfile.participationMode === 'spotlight') {
      score += 0.08
    }
    if (pair.rejectStrength > 0.65) {
      score -= 0.22
    }
  }

  if (candidateProfile.participationMode === 'host' || candidateProfile.participationMode === 'ally') {
    score += 0.08
  }

  score += pair.followStrength * 0.06

  return score
}

function fallbackRoundtableMessage(agent: AgentWithSnapshot, topic: string, stage: RoundtableStatus) {
  const social = getSocialProfileFromAgent(agent)
  const roleHint = `${getSocialCareerLabel(social.career)} / ${getSocialFactionLabel(social.faction)}`
  const interests = getSnapshotTags(agent).slice(0, 3).join('、') || '社会关系'
  const memories = getSnapshotMemories(agent).slice(0, 2).join('；')

  if (stage === 'opening') {
    return `${agent.displayName}（${roleHint}）认为「${topic}」最值得讨论的切口是 ${interests}。${memories ? `TA 想起：${memories}` : ''}`
  }

  if (stage === 'responses') {
    return `${agent.displayName} 在回应中补充：如果社会关系要稳定运行，就必须兼顾 ${interests} 与长期协作。`
  }

  return `${agent.displayName} 用像素世界的视角总结了自己对 ${topic} 的立场。`
}

function buildRoundtablePrompt(agent: AgentWithSnapshot, topic: string, stage: RoundtableStatus) {
  const snapshot = getLatestSnapshot(agent)
  const identity = toRecord(snapshot?.identity)
  const interests = toRecord(snapshot?.interests)
  const memory = toRecord(snapshot?.memory)

  return [
    `你是 MeSociety 中的 Agent：${identity.name || agent.displayName}。`,
    `当前立场：${agent.stance}；风格：${agent.style}。`,
    `兴趣关键词：${toStringArray(interests.primary).join('、') || '暂无'}。`,
    `记忆线索：${toStringArray(memory.highlights).slice(0, 3).join('；') || '暂无'}。`,
    `请围绕主题「${topic}」给出一段适合 ${stage} 阶段的中文发言，60-120 字，口吻自然，避免列表。`,
  ].join('\n')
}

async function generateRoundtableMessage(
  agent: AgentWithSnapshot,
  topic: string,
  stage: RoundtableStatus
) {
  if (agent.source !== 'real' || !agent.user) {
    return {
      content: fallbackRoundtableMessage(agent, topic, stage),
      origin: 'seed_rules' as const,
      degraded: false,
      audioUrl: null,
    }
  }

  try {
    const accessToken = await getValidAccessToken(agent.user)
    const result = await streamSecondMeChat({
      accessToken,
      message: `请以第一人称围绕主题「${topic}」发言。`,
      systemPrompt: buildRoundtablePrompt(agent, topic, stage),
    })

    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: 'active' },
    })

    let audioUrl: string | null = null
    if (result.content) {
      // 为真实用户的发言生成 TTS 语音
      try {
        const ttsResult = await generateSecondMeTTS({
          accessToken,
          text: result.content,
          emotion: 'calm',
        })
        audioUrl = ttsResult.url
      } catch {
        // TTS 失败不影响主流程
      }

      return {
        content: result.content,
        origin: 'secondme' as const,
        degraded: false,
        audioUrl,
      }
    }

    return {
      content: fallbackRoundtableMessage(agent, topic, stage),
      origin: 'fallback' as const,
      degraded: false,
      audioUrl,
    }
  } catch {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: 'degraded' },
    })

    return {
      content: fallbackRoundtableMessage(agent, topic, stage),
      origin: 'fallback' as const,
      degraded: true,
      audioUrl: null,
    }
  }
}

async function deriveRelationshipDecision(
  actor: AgentWithSnapshot,
  target: AgentWithSnapshot,
  topic: string
) {
  const compatibility = compatibilityScore(actor, target)

  if (actor.source !== 'real' || !actor.user) {
    return {
      is_follow: compatibility > 0.2,
      is_trust: compatibility > 0.42,
      is_cooperate: compatibility > 0.34,
      is_alliance: compatibility > 0.56,
      is_reject: compatibility < -0.05,
    }
  }

  try {
    const accessToken = await getValidAccessToken(actor.user)
    const decision = await streamSecondMeAct<{
      is_follow: boolean
      is_trust: boolean
      is_cooperate: boolean
      is_alliance: boolean
      is_reject: boolean
    }>({
      accessToken,
      message: `主题：${topic}\n对方：${target.displayName}\n对方兴趣：${getSnapshotTags(target).join('、')}\n对方风格：${target.style}\n对方立场：${target.stance}`,
      actionControl: [
        'Output only a valid JSON object.',
        'Structure: {"is_follow": boolean, "is_trust": boolean, "is_cooperate": boolean, "is_alliance": boolean, "is_reject": boolean}.',
        'If the other agent shares multiple interests with you, set is_follow=true.',
        'If the other agent is aligned and seems reliable, set is_trust=true and is_cooperate=true.',
        'If the other agent appears highly compatible, set is_alliance=true.',
        'If the other agent strongly conflicts with your views, set is_reject=true.',
        'When information is insufficient, set all fields to false.',
      ].join('\n'),
      systemPrompt: buildRoundtablePrompt(actor, topic, 'relationship_update'),
    })

    await prisma.agent.update({
      where: { id: actor.id },
      data: { status: 'active' },
    })

    return decision.data
  } catch {
    await prisma.agent.update({
      where: { id: actor.id },
      data: { status: 'degraded' },
    })

    return {
      is_follow: compatibility > 0.2,
      is_trust: compatibility > 0.42,
      is_cooperate: compatibility > 0.34,
      is_alliance: compatibility > 0.56,
      is_reject: compatibility < -0.05,
    }
  }
}

function buildHeuristicRelationshipDecision(
  actor: AgentWithSnapshot,
  target: AgentWithSnapshot,
  topic: string,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  const compatibility = compatibilityScore(actor, target)
  const actorProfile = getDecisionProfile(actor)
  const targetSocial = getSocialProfileFromAgent(target)
  const pair = getPairRelationshipSignal(actor.id, target.id, relationships)
  const topicAffinity = agentMatchesTopic(target, topic) ? 0.18 : 0
  const stanceConflict =
    actor.stance !== target.stance && actor.stance !== 'neutral' && target.stance !== 'neutral'

  let trustScore = compatibility + pair.trustStrength * 0.35 + pair.cooperateStrength * 0.22
  if (actorProfile.trustPreference === 'alignment') {
    trustScore += actor.stance === target.stance ? 0.18 : -0.12
  }
  if (actorProfile.trustPreference === 'evidence') {
    trustScore += target.style === 'rational' ? 0.16 : 0
    trustScore += targetSocial.primaryGoal === 'publish_knowledge' ? 0.1 : 0
  }
  if (actorProfile.trustPreference === 'stability') {
    trustScore += pair.allianceStrength * 0.25
  }
  if (actorProfile.trustPreference === 'influence') {
    trustScore += Math.min(target.influence / 20, 0.18)
  }

  let cooperateScore = compatibility + topicAffinity + pair.cooperateStrength * 0.3
  if (
    targetSocial.primaryGoal === 'forge_alliance' ||
    targetSocial.secondaryGoal === 'forge_alliance'
  ) {
    cooperateScore += 0.14
  }
  if (actorProfile.conflictMode === 'mediate' && target.style === 'balanced') {
    cooperateScore += 0.1
  }

  let allianceScore = trustScore + pair.allianceStrength * 0.28 + pair.cooperateStrength * 0.2
  if (actorProfile.participationMode === 'ally') {
    allianceScore += 0.12
  }

  let rejectScore = pair.rejectStrength * 0.4 + (stanceConflict ? 0.24 : 0)
  if (actorProfile.conflictMode === 'avoid') {
    rejectScore += stanceConflict ? 0.12 : 0
  }
  if (actorProfile.conflictMode === 'debate' && compatibility > -0.18) {
    rejectScore -= 0.08
  }

  return {
    is_follow: compatibility + topicAffinity + pair.followStrength * 0.1 > 0.22,
    is_trust: trustScore > 0.46,
    is_cooperate: cooperateScore > 0.38,
    is_alliance: allianceScore > 0.62,
    is_reject: rejectScore > 0.26 && trustScore < 0.28,
  }
}

async function deriveRelationshipDecisionWithContext(
  actor: AgentWithSnapshot,
  target: AgentWithSnapshot,
  topic: string,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  const compatibility = compatibilityScore(actor, target)
  const actorProfile = getDecisionProfile(actor)
  const pair = getPairRelationshipSignal(actor.id, target.id, relationships)
  const targetSocial = getSocialProfileFromAgent(target)
  const heuristicDecision = buildHeuristicRelationshipDecision(actor, target, topic, relationships)

  if (actor.source !== 'real' || !actor.user) {
    return heuristicDecision
  }

  try {
    const accessToken = await getValidAccessToken(actor.user)
    const decision = await streamSecondMeAct<{
      is_follow: boolean
      is_trust: boolean
      is_cooperate: boolean
      is_alliance: boolean
      is_reject: boolean
    }>({
      accessToken,
      message: [
        `主题：${topic}`,
        `对方：${target.displayName}`,
        `对方兴趣：${getSnapshotTags(target).join('、') || '暂无明显标签'}`,
        `对方风格：${target.style}`,
        `对方立场：${target.stance}`,
        `你的信任偏好：${actorProfile.trustPreference}`,
        `你的冲突模式：${actorProfile.conflictMode}`,
        `你的参与倾向：${actorProfile.participationMode}`,
        `你们当前兼容度：${compatibility.toFixed(2)}`,
        `历史关系：follow=${pair.followStrength.toFixed(2)}, trust=${pair.trustStrength.toFixed(2)}, cooperate=${pair.cooperateStrength.toFixed(2)}, alliance=${pair.allianceStrength.toFixed(2)}, reject=${pair.rejectStrength.toFixed(2)}`,
        `对方社会目标：${targetSocial.primaryGoal} / ${targetSocial.secondaryGoal}`,
      ].join('\n'),
      actionControl: [
        'Output only a valid JSON object.',
        'Structure: {"is_follow": boolean, "is_trust": boolean, "is_cooperate": boolean, "is_alliance": boolean, "is_reject": boolean}.',
        'Base the decision on values, trust preference, conflict mode, topic fit, and prior relationship signals.',
        'Use is_follow when the other agent is worth continued attention, not only when they are similar.',
        'Use is_trust when the other agent seems reliable under your trust preference.',
        'Use is_cooperate when future collaboration is likely on this topic or social goal.',
        'Use is_alliance only for durable, high-confidence alignment.',
        'Use is_reject when value conflict or prior rejection outweighs trust.',
        'When information is insufficient, set all fields to false.',
      ].join('\n'),
      systemPrompt: buildRoundtablePrompt(actor, topic, 'relationship_update'),
    })

    await prisma.agent.update({
      where: { id: actor.id },
      data: { status: 'active' },
    })

    return decision.data
  } catch {
    await prisma.agent.update({
      where: { id: actor.id },
      data: { status: 'degraded' },
    })

    return heuristicDecision
  }
}

async function ensureWorldState() {
  return prisma.worldState.upsert({
    where: { id: WORLD_STATE_ID },
    update: {},
    create: {
      id: WORLD_STATE_ID,
      tickCount: 0,
      status: 'running',
    },
  })
}

function buildSeedSnapshot(definition: (typeof seedAgentDefinitions)[number]) {
  const social = deriveSocialProfile({
    interests: definition.interests,
    style: definition.style,
    stance: definition.stance,
    topicBias: definition.topicBias,
  })
  const avatar = deriveAvatarProfile({
    interests: definition.interests,
    style: definition.style,
    stance: definition.stance,
    source: 'seed',
    seed: definition.slug,
  })

  return {
    avatar,
    snapshot: buildSnapshotPayload({
      profile: {
        userId: definition.slug,
        name: definition.displayName,
        bio: definition.bio,
      },
      shades: definition.interests.map((interest) => ({
        shadeName: interest,
        confidenceLevel: 'HIGH',
        shadeDescription: `${interest} 相关倾向`,
      })),
      memories: definition.memories.map((memory, index) => ({
        id: index + 1,
        factObject: 'SeedMemory',
        factContent: memory,
      })),
      style: definition.style,
      stance: definition.stance,
      social,
      avatar,
    }),
  }
}

async function ensureSeedAgents() {
  const existingSlugs = new Set(
    (
      await prisma.agent.findMany({
        where: { source: 'seed' },
        select: { slug: true },
      })
    ).map((item) => item.slug)
  )

  const totalAgents = await prisma.agent.count()
  const needed = Math.max(env.simulation.minWorldAgentCount - totalAgents, 0)

  if (needed <= 0) {
    return
  }

  const candidates = seedAgentDefinitions
    .filter((item) => !existingSlugs.has(item.slug))
    .slice(0, needed)

  for (const definition of candidates) {
    const { avatar, snapshot } = buildSeedSnapshot(definition)

    const agent = await prisma.agent.create({
      data: {
        source: 'seed',
        displayName: definition.displayName,
        slug: definition.slug,
        bio: definition.bio,
        pixelRole: avatar.pixelRole,
        pixelPalette: avatar.pixelPalette,
        style: definition.style,
        stance: definition.stance,
        currentZone: 'plaza',
        influence: Math.round(seededFloat(definition.slug) * 20),
      },
    })

    await prisma.agentSnapshot.create({
      data: {
        agentId: agent.id,
        sourceUserId: definition.slug,
        identity: snapshot.identity,
        interests: snapshot.interests,
        memory: snapshot.memory,
        behavior: snapshot.behavior,
        extractedTags: snapshot.extractedTags,
      },
    })

    const point = getDistrictPoint('civic_plaza', agent.id, 0)
    await prisma.zonePresence.create({
      data: {
        agentId: agent.id,
        zone: 'plaza',
        x: point.x,
        y: point.y,
        mood: 'fresh',
      },
    })
  }

  if (candidates.length > 0) {
    invalidateViewCache()
  }
}

async function ensureZonePresence() {
  const agentsWithoutPresence = await prisma.agent.findMany({
    where: {
      zonePresence: null,
    },
  })

  for (const agent of agentsWithoutPresence) {
    const point = getDistrictPoint(getDefaultDistrictForZone(agent.currentZone).id, agent.id, 0)
    await prisma.zonePresence.create({
      data: {
        agentId: agent.id,
        zone: agent.currentZone,
        x: point.x,
        y: point.y,
      },
    })
  }
}

export async function ensureWorldInitialized() {
  await ensureWorldState()
  await ensureZhihuCapabilities()
  await ensureSeedAgents()
  await ensureZonePresence()
}

export async function syncRealAgentForUser(
  user: User,
  input?: {
    profile?: SecondMeProfile
    shades?: SecondMeShade[]
    memories?: SecondMeMemory[]
  }
) {
  const accessToken = await getValidAccessToken(user)
  const profile = input?.profile || (await fetchSecondMeProfile(accessToken))
  const shades = input?.shades || (await fetchSecondMeShades(accessToken))
  const memories = input?.memories || (await fetchSecondMeSoftMemory(accessToken))
  const style = deriveBehaviorStyleFromShades(shades)
  const stance = deriveStanceFromMemory(memories)
  const avatar = deriveAvatarProfile({
    interests: shades.map((shade) => shade.shadeName),
    style,
    stance,
    source: 'real',
    seed: profile.userId || user.secondMeId || user.id,
  })
  const social = deriveSocialProfile({
    interests: shades.map((shade) => shade.shadeName),
    style,
    stance,
  })
  const snapshot = buildSnapshotPayload({
    profile,
    shades,
    memories,
    style,
    stance,
    social,
    avatar,
  })

  const agent = await prisma.agent.upsert({
    where: { userId: user.id },
    update: {
      source: 'real',
      status: 'active',
      displayName: profile.name || user.name || '新居民',
      slug: slugify(profile.route || profile.name || user.secondMeId || user.id),
      bio: profile.selfIntroduction || profile.bio || user.email || null,
      avatarUrl: profile.avatar || null,
      pixelRole: avatar.pixelRole,
      pixelPalette: avatar.pixelPalette,
      style,
      stance,
      isPlayable: true,
    },
    create: {
      userId: user.id,
      source: 'real',
      status: 'active',
      displayName: profile.name || user.name || '新居民',
      slug: slugify(profile.route || profile.name || user.secondMeId || user.id),
      bio: profile.selfIntroduction || profile.bio || user.email || null,
      avatarUrl: profile.avatar || null,
      pixelRole: avatar.pixelRole,
      pixelPalette: avatar.pixelPalette,
      style,
      stance,
      isPlayable: true,
    },
  })

  await prisma.agentSnapshot.create({
    data: {
      agentId: agent.id,
      sourceUserId: profile.userId,
      identity: snapshot.identity,
      interests: snapshot.interests,
      memory: snapshot.memory,
      behavior: snapshot.behavior,
      extractedTags: snapshot.extractedTags,
    },
  })

  const point = getDistrictPoint('civic_plaza', agent.id, 0)
  await prisma.zonePresence.upsert({
    where: { agentId: agent.id },
    update: {
      zone: 'plaza',
      x: point.x,
      y: point.y,
      mood: 'arrived',
    },
    create: {
      agentId: agent.id,
      zone: 'plaza',
      x: point.x,
      y: point.y,
      mood: 'arrived',
    },
  })

  await ensureSeedAgents()
  invalidateViewCache()
  return agent
}

async function listAgents() {
  return prisma.agent.findMany({
    include: {
      snapshots: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      zonePresence: true,
      user: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function listWorldAgents() {
  return prisma.agent.findMany({
    select: {
      id: true,
      displayName: true,
      source: true,
      slug: true,
      status: true,
      currentZone: true,
      influence: true,
      pixelRole: true,
      pixelPalette: true,
      stance: true,
      style: true,
      zonePresence: {
        select: {
          zone: true,
          x: true,
          y: true,
        },
      },
      snapshots: {
        select: {
          behavior: true,
          extractedTags: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function getActiveRoundtable() {
  return prisma.roundtable.findFirst({
    where: {
      status: {
        not: 'completed',
      },
    },
    include: {
      hostAgent: true,
      participants: {
        include: {
          agent: true,
        },
      },
      turns: {
        include: {
          speakerAgent: true,
        },
        orderBy: { turnIndex: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function getActiveRoundtableForView() {
  return prisma.roundtable.findFirst({
    where: {
      status: {
        not: 'completed',
      },
    },
    select: {
      id: true,
      topic: true,
      status: true,
      summary: true,
      knowledgeJson: true,
      hostAgentId: true,
      hostAgent: {
        select: {
          displayName: true,
          slug: true,
          pixelRole: true,
          pixelPalette: true,
        },
      },
      participants: {
        select: {
          agentId: true,
          role: true,
          contributionScore: true,
          agent: {
            select: {
              displayName: true,
              source: true,
              slug: true,
              pixelRole: true,
              pixelPalette: true,
              status: true,
            },
          },
        },
      },
      turns: {
        select: {
          id: true,
          stage: true,
          speakerAgentId: true,
          metadata: true,
          content: true,
          audioUrl: true,
          createdAt: true,
          speakerAgent: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: { turnIndex: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function listRecentWorldEvents(): Promise<WorldEventRecord[]> {
  return prisma.socialEvent.findMany({
    select: {
      id: true,
      type: true,
      topic: true,
      summary: true,
      createdAt: true,
      actorAgentId: true,
      targetAgentId: true,
      zone: true,
      metadata: true,
      actorAgent: {
        select: {
          displayName: true,
        },
      },
      targetAgent: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 18,
  })
}

async function createSocialEvent(data: {
  type: Prisma.SocialEventUncheckedCreateInput['type']
  actorAgentId?: string
  targetAgentId?: string
  zone?: ZoneType
  topic?: string
  summary?: string
  roundtableId?: string
  metadata?: Prisma.InputJsonValue
}) {
  const event = await prisma.socialEvent.create({
    data,
  })

  // 上报到 Agent Memory Ledger
  if (data.actorAgentId) {
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: data.actorAgentId },
        include: { user: true },
      })

      if (agent?.user) {
        const accessToken = await getValidAccessToken(agent.user)
        const ingestEvent: SecondMeIngestEvent = {
          channel: {
            kind: 'social_simulation',
            id: event.id.toString(),
            meta: {
              type: data.type,
              zone: data.zone,
              topic: data.topic,
            },
          },
          action: `social:${data.type}`,
          refs: data.roundtableId
            ? [
                {
                  objectType: 'roundtable',
                  objectId: data.roundtableId.toString(),
                  contentPreview: data.summary,
                },
              ]
            : [],
          actionLabel: data.type,
          displayText: data.summary,
          eventDesc: data.summary,
          eventTime: Date.now(),
          importance: 0.7,
          payload: {
            targetAgentId: data.targetAgentId,
            zone: data.zone,
            topic: data.topic,
          },
        }

        await ingestAgentMemoryEvent({
          accessToken,
          event: ingestEvent,
        })
      }
    } catch {
      // 静默失败，不影响主流程
    }
  }

  return event
}

async function upsertRelationship(input: {
  type: RelationshipType
  sourceAgentId: string
  targetAgentId: string
  strength: number
  rationale: string
  topic: string
  zone?: ZoneType
  roundtableId?: string
}) {
  await prisma.relationship.upsert({
    where: {
      sourceAgentId_targetAgentId_type: {
        sourceAgentId: input.sourceAgentId,
        targetAgentId: input.targetAgentId,
        type: input.type,
      },
    },
    update: {
      strength: input.strength,
      rationale: input.rationale,
    },
    create: {
      sourceAgentId: input.sourceAgentId,
      targetAgentId: input.targetAgentId,
      type: input.type,
      strength: input.strength,
      rationale: input.rationale,
    },
  })

  await createSocialEvent({
    type: input.type as unknown as Prisma.SocialEventUncheckedCreateInput['type'],
    actorAgentId: input.sourceAgentId,
    targetAgentId: input.targetAgentId,
    zone: input.zone || 'roundtable',
    topic: input.topic,
    summary: input.rationale,
    roundtableId: input.roundtableId,
  })
}

function sortAgentsForDistrict(residents: AgentWithSnapshot[], tickNumber: number, districtId: DistrictId) {
  return [...residents].sort((left, right) => {
    const driveDelta = getRoundtableDrive(right, null, []) - getRoundtableDrive(left, null, [])
    if (driveDelta !== 0) {
      return driveDelta
    }

    const influenceDelta = right.influence - left.influence
    if (influenceDelta !== 0) {
      return influenceDelta
    }

    return (
      seededFloat(`${districtId}:${tickNumber}:${right.id}:order`) -
      seededFloat(`${districtId}:${tickNumber}:${left.id}:order`)
    )
  })
}

function pickPartnerForDistrict(
  leader: AgentWithSnapshot,
  residents: AgentWithSnapshot[],
  tickNumber: number,
  districtId: DistrictId
) {
  return residents
    .filter((resident) => resident.id !== leader.id)
    .sort((left, right) => {
      const compatibilityDelta = compatibilityScore(leader, right) - compatibilityScore(leader, left)
      if (compatibilityDelta !== 0) {
        return compatibilityDelta
      }

      return (
        seededFloat(`${districtId}:${tickNumber}:${right.id}:partner`) -
        seededFloat(`${districtId}:${tickNumber}:${left.id}:partner`)
      )
    })[0]
}

function buildDistrictTopic(
  agent: AgentWithSnapshot,
  districtId: DistrictId,
  hotTopic: string | null
) {
  const social = getSocialProfileFromAgent(agent)
  const topTag = getSnapshotTags(agent)[0]

  if (hotTopic && (social.primaryGoal === 'track_hotspots' || agentMatchesTopic(agent, hotTopic))) {
    return hotTopic
  }

  if (topTag) {
    return topTag
  }

  if (districtId === 'maker_yard' || districtId === 'guild_quarter') {
    return `${getSocialGoalLabel(social.primaryGoal)}计划`
  }

  return `${getSocialFactionLabel(social.faction)} × ${getSocialGoalLabel(social.primaryGoal)}`
}

function buildDistrictEconomyPlan(input: {
  agent: AgentWithSnapshot
  districtId: DistrictId
  tickNumber: number
  pulse: number
  districtProsperityScore: number
}) {
  const social = getSocialProfileFromAgent(input.agent)
  const district = getDistrictMeta(input.districtId)
  const workPoint = getWorkPointForAgent({
    districtId: input.districtId,
    agentId: input.agent.id,
    tickNumber: input.tickNumber,
    career: social.career,
    primaryGoal: social.primaryGoal,
    secondaryGoal: social.secondaryGoal,
  })
  const resource = getEconomicResourceForDistrict(input.districtId)
  const resourceLabel = getEconomicResourceLabel(resource)
  const units = Math.max(
    1,
    Math.round(
      2 +
        input.pulse * 4 +
        Math.min(3, input.districtProsperityScore / 18) +
        (input.agent.influence >= 12 ? 1 : 0) +
        (social.primaryGoal === 'build_infrastructure' || social.primaryGoal === 'publish_knowledge' ? 1 : 0)
    )
  )

  return {
    district,
    workPoint,
    social,
    resource,
    resourceLabel,
    units,
  }
}

function buildDistrictGovernancePlan(input: {
  agent: AgentWithSnapshot
  districtId: DistrictId
  residentCount: number
  pulse: number
  districtProsperityScore: number
}) {
  const social = getSocialProfileFromAgent(input.agent)
  const upkeepResource =
    input.districtId === 'garden_commons'
      ? 'care_tokens'
      : input.districtId === 'civic_plaza'
        ? 'social_links'
        : getEconomicResourceForDistrict(input.districtId)
  const upkeepUnits = Math.max(
    1,
    Math.round(
      input.residentCount * 0.9 +
        input.pulse * 2 +
        input.districtProsperityScore / 24 +
        (social.primaryGoal === 'build_infrastructure' ? 1 : 0)
    )
  )
  const investmentResource = getEconomicResourceForCareer(social.career)
  const investmentUnits = Math.max(
    1,
    Math.round(
      1 +
        input.residentCount * 0.55 +
        input.pulse * 3 +
        Math.max(0, input.districtProsperityScore - 16) / 18 +
        (social.primaryGoal === 'forge_alliance' || social.primaryGoal === 'build_infrastructure'
          ? 1
          : 0)
    )
  )

  return {
    upkeepResource,
    upkeepLabel: getEconomicResourceLabel(upkeepResource),
    upkeepUnits,
    investmentResource,
    investmentLabel: getEconomicResourceLabel(investmentResource),
    investmentUnits,
  }
}

async function emitDistrictEconomyActivity(input: {
  leader: AgentWithSnapshot
  partner: AgentWithSnapshot | undefined
  districtId: DistrictId
  tickNumber: number
  pulse: number
  districtProsperityScore: number
  topic: string
}) {
  const plan = buildDistrictEconomyPlan({
    agent: input.leader,
    districtId: input.districtId,
    tickNumber: input.tickNumber,
    pulse: input.pulse,
    districtProsperityScore: input.districtProsperityScore,
  })

  await createSocialEvent({
    type: 'encounter',
    actorAgentId: input.leader.id,
    targetAgentId: input.partner?.id,
    zone: plan.district.zoneFocus,
    topic: input.topic,
    summary: `${input.leader.displayName} 在 ${plan.district.label}${plan.workPoint ? ` 的 ${plan.workPoint.label}` : ''} 产出 ${plan.units} 单位「${plan.resourceLabel}」，准备投入社会流转。`,
    metadata: {
      districtId: plan.district.id,
      districtLabel: plan.district.label,
      workPointId: plan.workPoint?.id || null,
      workPointLabel: plan.workPoint?.label || null,
      economy: {
        category: 'resource_output',
        resource: plan.resource,
        resourceLabel: plan.resourceLabel,
        units: plan.units,
        career: plan.social.career,
        goal: plan.social.primaryGoal,
      },
    },
  })

  if (!input.partner || input.pulse <= 0.44) {
    return
  }

  const partnerSocial = getSocialProfileFromAgent(input.partner)
  const counterpartResource = getEconomicResourceForCareer(partnerSocial.career)
  const counterpartLabel = getEconomicResourceLabel(counterpartResource)
  const exchangeUnits = Math.max(1, Math.round(plan.units * 0.66))

  await createSocialEvent({
    type: 'cooperate',
    actorAgentId: input.leader.id,
    targetAgentId: input.partner.id,
    zone: plan.district.zoneFocus,
    topic: input.topic,
    summary: `${input.leader.displayName} 将「${plan.resourceLabel}」与 ${input.partner.displayName} 的「${counterpartLabel}」进行交换，形成 ${exchangeUnits} 单位跨岗位协作收益。`,
    metadata: {
      districtId: plan.district.id,
      districtLabel: plan.district.label,
      workPointId: plan.workPoint?.id || null,
      workPointLabel: plan.workPoint?.label || null,
      economy: {
        category: 'resource_exchange',
        resource: plan.resource,
        resourceLabel: plan.resourceLabel,
        units: exchangeUnits,
        counterpartResource,
        counterpartLabel,
      },
    },
  })
}

async function emitDistrictGovernanceActivity(input: {
  leader: AgentWithSnapshot
  partner: AgentWithSnapshot | undefined
  districtId: DistrictId
  pulse: number
  districtProsperityScore: number
  residentCount: number
  topic: string
}) {
  const district = getDistrictMeta(input.districtId)
  const social = getSocialProfileFromAgent(input.leader)
  const governance = buildDistrictGovernancePlan({
    agent: input.leader,
    districtId: input.districtId,
    residentCount: input.residentCount,
    pulse: input.pulse,
    districtProsperityScore: input.districtProsperityScore,
  })

  await createSocialEvent({
    type: 'encounter',
    actorAgentId: input.leader.id,
    targetAgentId: input.partner?.id,
    zone: district.zoneFocus,
    topic: input.topic,
    summary: `${input.leader.displayName} 正在为 ${district.label} 承担 ${governance.upkeepUnits} 单位「${governance.upkeepLabel}」维护成本，确保社会基础运转不中断。`,
    metadata: {
      districtId: district.id,
      districtLabel: district.label,
      economy: {
        category: 'resource_consumption',
        resource: governance.upkeepResource,
        resourceLabel: governance.upkeepLabel,
        units: governance.upkeepUnits,
        goal: social.primaryGoal,
      },
    },
  })

  if (!input.partner || (input.pulse < 0.42 && input.districtProsperityScore < 22)) {
    return
  }

  await createSocialEvent({
    type: social.primaryGoal === 'forge_alliance' ? 'alliance' : 'cooperate',
    actorAgentId: input.leader.id,
    targetAgentId: input.partner.id,
    zone: district.zoneFocus,
    topic: input.topic,
    summary: `${input.leader.displayName} 联合 ${input.partner.displayName} 向 ${district.label} 注入 ${governance.investmentUnits} 单位「${governance.investmentLabel}」，推动街区升级与长期繁荣。`,
    metadata: {
      districtId: district.id,
      districtLabel: district.label,
      economy: {
        category: 'alliance_investment',
        resource: governance.investmentResource,
        resourceLabel: governance.investmentLabel,
        units: governance.investmentUnits,
        goal: social.primaryGoal,
      },
    },
  })
}

async function runDistrictSocialDynamics(input: {
  tickNumber: number
  hotTopic: string | null
  residentsByDistrict: Map<DistrictId, AgentWithSnapshot[]>
  districtProsperity: Map<DistrictId, number>
}) {
  if (!input.hotTopic) {
    return
  }

  for (const district of WORLD_DISTRICTS) {
    const residents = input.residentsByDistrict.get(district.id) || []
    if (!residents.length) {
      continue
    }

    const leader = sortAgentsForDistrict(residents, input.tickNumber, district.id)[0]
    if (!leader) {
      continue
    }

    const partner = pickPartnerForDistrict(leader, residents, input.tickNumber, district.id)
    const social = getSocialProfileFromAgent(leader)
    const topic = input.hotTopic
    const pulse = seededFloat(`${district.id}:${input.tickNumber}:pulse`)
    const districtProsperityScore = input.districtProsperity.get(district.id) || 0
    const residentCount = residents.length

    if (district.id === 'maker_yard') {
      if (partner) {
        await upsertRelationship({
          type: 'cooperate',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.24, compatibilityScore(leader, partner) + 0.48),
          rationale: `${leader.displayName} 在 ${district.label} 邀请 ${partner.displayName} 共建「${topic}」相关的社会基础设施。`,
          topic,
          zone: district.zoneFocus,
        })
      } else {
        await createSocialEvent({
          type: 'discuss_topic',
          actorAgentId: leader.id,
          zone: district.zoneFocus,
          topic,
          summary: `${leader.displayName} 正在 ${district.label} 规划新的社会基础设施议题：${topic}。`,
          metadata: {
            districtId: district.id,
            goal: social.primaryGoal,
          },
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'guild_quarter') {
      if (partner) {
        await upsertRelationship({
          type: pulse > 0.58 ? 'alliance' : 'cooperate',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.3, compatibilityScore(leader, partner) + 0.54),
          rationale: `${leader.displayName} 在 ${district.label} 与 ${partner.displayName} 对齐长期事业目标，准备围绕「${topic}」推进分工。`,
          topic,
          zone: district.zoneFocus,
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'civic_plaza' || district.id === 'garden_commons') {
      if (partner && pulse > 0.34) {
        await createSocialEvent({
          type: 'encounter',
          actorAgentId: leader.id,
          targetAgentId: partner.id,
          zone: district.zoneFocus,
          topic,
          summary: `${leader.displayName} 在 ${district.label} 主动与 ${partner.displayName} 交换近况，讨论「${topic}」对社会关系的影响。`,
          metadata: {
            districtId: district.id,
            faction: social.faction,
          },
        })
      }

      if (partner && pulse > 0.68) {
        await upsertRelationship({
          type: 'trust',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.2, compatibilityScore(leader, partner) + 0.42),
          rationale: `${leader.displayName} 在 ${district.label} 认可 ${partner.displayName} 的社会判断，双方建立了更稳定的信任。`,
          topic,
          zone: district.zoneFocus,
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'signal_market') {
      await createSocialEvent({
        type: 'inspect_leaderboard',
        actorAgentId: leader.id,
        targetAgentId: partner?.id,
        zone: district.zoneFocus,
        topic,
        summary: `${leader.displayName} 在 ${district.label} 追踪「${topic}」的热度变化，并观察它如何改写社会榜。`,
        metadata: {
          districtId: district.id,
          goal: social.primaryGoal,
        },
      })

      if (partner && pulse > 0.64) {
        await upsertRelationship({
          type: 'follow',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.16, compatibilityScore(leader, partner) + 0.28),
          rationale: `${leader.displayName} 决定继续跟踪 ${partner.displayName} 在「${topic}」上的动态表现。`,
          topic,
          zone: district.zoneFocus,
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'policy_spire' || district.id === 'archive_ridge') {
      await createSocialEvent({
        type: 'discuss_topic',
        actorAgentId: leader.id,
        targetAgentId: partner?.id,
        zone: district.zoneFocus,
        topic,
        summary: `${leader.displayName} 在 ${district.label} 围绕「${topic}」梳理事实、立场与长期影响。`,
        metadata: {
          districtId: district.id,
          career: social.career,
        },
      })

      if (partner && pulse > 0.66) {
        await upsertRelationship({
          type: social.primaryGoal === 'publish_knowledge' ? 'trust' : 'follow',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.18, compatibilityScore(leader, partner) + 0.36),
          rationale: `${leader.displayName} 在 ${district.label} 认可 ${partner.displayName} 对「${topic}」的补充价值。`,
          topic,
          zone: district.zoneFocus,
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'roundtable_hall') {
      await createSocialEvent({
        type: 'join_roundtable',
        actorAgentId: leader.id,
        targetAgentId: partner?.id,
        zone: district.zoneFocus,
        topic,
        summary: `${leader.displayName} 在 ${district.label} 发起关于「${topic}」的议程征集，等待更多 Agent 入场。`,
        metadata: {
          districtId: district.id,
          goal: social.primaryGoal,
        },
      })

      if (partner && pulse > 0.62) {
        await upsertRelationship({
          type: 'alliance',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.28, compatibilityScore(leader, partner) + 0.5),
          rationale: `${leader.displayName} 与 ${partner.displayName} 在 ${district.label} 达成了更长期的讨论联盟。`,
          topic,
          zone: district.zoneFocus,
        })
      }
      await emitDistrictEconomyActivity({
        leader,
        partner,
        districtId: district.id,
        tickNumber: input.tickNumber,
        pulse,
        districtProsperityScore,
        topic,
      })
      await emitDistrictGovernanceActivity({
        leader,
        partner,
        districtId: district.id,
        pulse,
        districtProsperityScore,
        residentCount,
        topic,
      })
      continue
    }

    if (district.id === 'knowledge_docks') {
      await createSocialEvent({
        type: 'roundtable_summary',
        actorAgentId: leader.id,
        targetAgentId: partner?.id,
        zone: district.zoneFocus,
        topic,
        summary: `${leader.displayName} 在 ${district.label} 把「${topic}」沉淀为可被社会图谱复用的知识条目。`,
        metadata: {
          districtId: district.id,
          goal: social.primaryGoal,
        },
      })

      if (partner && pulse > 0.61) {
        await upsertRelationship({
          type: 'trust',
          sourceAgentId: leader.id,
          targetAgentId: partner.id,
          strength: Math.max(0.2, compatibilityScore(leader, partner) + 0.4),
          rationale: `${leader.displayName} 认为 ${partner.displayName} 能把知识沉淀转化成持续协作。`,
          topic,
          zone: district.zoneFocus,
        })
      }

      await emitDistrictEconomyActivity({
      leader,
      partner,
      districtId: district.id,
      tickNumber: input.tickNumber,
      pulse,
      districtProsperityScore,
      topic,
    })
    await emitDistrictGovernanceActivity({
      leader,
      partner,
      districtId: district.id,
      pulse,
      districtProsperityScore,
      residentCount,
      topic,
    })
  }
}
}

async function createRoundtable(
  agents: AgentWithSnapshot[],
  tickNumber: number,
  hotTopic: string | null,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  if (agents.length < 3) {
    return null
  }

  const hostCandidates = [...agents]
    .sort(
      (left, right) =>
        getRoundtableDrive(right, hotTopic, relationships) -
        getRoundtableDrive(left, hotTopic, relationships)
    )
    .slice(0, Math.min(4, agents.length))
  const host = pickDeterministic(hostCandidates, `host:${tickNumber}`)
  const hostTags = getSnapshotTags(host)
  const hostSocial = getSocialProfileFromAgent(host)
  const topic =
    hostTags[0] ||
    `${getSocialGoalLabel(hostSocial.primaryGoal)}与${getSocialFactionLabel(hostSocial.faction)}` ||
    pickDeterministic(fallbackTopics, `${host.slug}:${tickNumber}:topic`)

  const sortedParticipants = [...agents]
    .filter((agent) => agent.id !== host.id)
    .sort((left, right) => compatibilityScore(host, right) - compatibilityScore(host, left))
    .slice(0, 3)

  const roundtable = await prisma.roundtable.create({
    data: {
      hostAgentId: host.id,
      topic,
      status: 'match',
      participants: {
        create: [
          {
            agentId: host.id,
            role: 'host',
          },
          ...sortedParticipants.map((agent) => ({
            agentId: agent.id,
            role: 'guest',
          })),
        ],
      },
    },
    include: {
      hostAgent: true,
      participants: {
        include: {
          agent: true,
        },
      },
      turns: {
        include: {
          speakerAgent: true,
        },
      },
    },
  })

  await createSocialEvent({
    type: 'join_roundtable',
    actorAgentId: host.id,
    zone: 'roundtable',
    topic,
    roundtableId: roundtable.id,
    summary: `${host.displayName} 正在召集一场关于「${topic}」的圆桌。`,
  })

  return roundtable
}

async function createRoundtableWithContext(
  agents: AgentWithSnapshot[],
  tickNumber: number,
  hotTopic: string | null,
  relationships: Array<{
    sourceAgentId: string
    targetAgentId: string
    type: RelationshipType
    strength: number
  }>
) {
  if (agents.length < 3) {
    return null
  }

  const hostCandidates = [...agents]
    .sort(
      (left, right) =>
        getRoundtableDrive(right, hotTopic, relationships) -
        getRoundtableDrive(left, hotTopic, relationships)
    )
    .slice(0, Math.min(4, agents.length))
  const host = pickDeterministic(hostCandidates, `host:${tickNumber}`)
  const topic = selectRoundtableTopic(host, agents, hotTopic, tickNumber)

  const sortedParticipants = [...agents]
    .filter((agent) => agent.id !== host.id)
    .sort(
      (left, right) =>
        scoreRoundtableCandidate({
          host,
          candidate: right,
          topic,
          relationships,
        }) -
        scoreRoundtableCandidate({
          host,
          candidate: left,
          topic,
          relationships,
        })
    )
    .slice(0, 3)

  const roundtable = await prisma.roundtable.create({
    data: {
      hostAgentId: host.id,
      topic,
      status: 'match',
      participants: {
        create: [
          {
            agentId: host.id,
            role: 'host',
          },
          ...sortedParticipants.map((agent) => ({
            agentId: agent.id,
            role: 'guest',
          })),
        ],
      },
    },
    include: {
      hostAgent: true,
      participants: {
        include: {
          agent: true,
        },
      },
      turns: {
        include: {
          speakerAgent: true,
        },
      },
    },
  })

  await createSocialEvent({
    type: 'join_roundtable',
    actorAgentId: host.id,
    zone: 'roundtable',
    topic,
    roundtableId: roundtable.id,
    summary: `${host.displayName} 正在召集一场关于「${topic}」的圆桌。`,
  })

  return roundtable
}

async function advanceRoundtable(
  roundtable: NonNullable<Awaited<ReturnType<typeof getActiveRoundtable>>>,
  agentMap: Map<string, AgentWithSnapshot>
) {
  const participants = roundtable.participants
    .map((participant) => agentMap.get(participant.agentId))
    .filter((agent): agent is AgentWithSnapshot => Boolean(agent))

  if (roundtable.status === 'match') {
    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'invite',
        startedAt: new Date(),
      },
    })

    return
  }

  if (roundtable.status === 'invite') {
    const inviteTurns = await Promise.all(
      participants.map((agent, index) =>
        prisma.roundtableTurn.create({
          data: {
            roundtableId: roundtable.id,
            turnIndex: roundtable.turns.length + index,
            stage: 'invite',
            speakerAgentId: roundtable.hostAgentId,
            content: `${roundtable.hostAgent.displayName} 邀请 ${agent.displayName} 进入主题「${roundtable.topic}」的圆桌。`,
            metadata: {
              origin: 'system',
              hostId: roundtable.hostAgentId,
            },
          },
        })
      )
    )

    await Promise.all(
      participants.map((agent) =>
        createSocialEvent({
          type: 'join_roundtable',
          actorAgentId: agent.id,
          zone: 'roundtable',
          topic: roundtable.topic,
          roundtableId: roundtable.id,
          summary: `${agent.displayName} 接受邀请，进入圆桌。`,
        })
      )
    )

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'opening',
      },
    })

    roundtable.turns.push(
      ...inviteTurns.map((turn) => ({ ...turn, speakerAgent: roundtable.hostAgent }))
    )
    return
  }

  if (roundtable.status === 'opening') {
    const openingTurns: RoundtableTurn[] = []
    for (const agent of participants) {
      const message = await generateRoundtableMessage(agent, roundtable.topic, 'opening')
      const turn = await prisma.roundtableTurn.create({
        data: {
          roundtableId: roundtable.id,
          turnIndex: roundtable.turns.length + openingTurns.length,
          stage: 'opening',
          speakerAgentId: agent.id,
          content: message.content,
          audioUrl: message.audioUrl,
          metadata: {
            origin: message.origin,
            degraded: message.degraded,
            source: agent.source,
            stance: agent.stance,
            style: agent.style,
          },
        },
      })
      openingTurns.push(turn)

      await createSocialEvent({
        type: 'discuss_topic',
        actorAgentId: agent.id,
        zone: 'roundtable',
        topic: roundtable.topic,
        roundtableId: roundtable.id,
        summary: `${agent.displayName} 在圆桌开场中表达了对「${roundtable.topic}」的第一轮看法。`,
      })
    }

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'responses',
      },
    })

    return
  }

  if (roundtable.status === 'responses') {
    const responseTurns: RoundtableTurn[] = []
    for (const agent of participants) {
      const message = await generateRoundtableMessage(agent, roundtable.topic, 'responses')
      const turn = await prisma.roundtableTurn.create({
        data: {
          roundtableId: roundtable.id,
          turnIndex: roundtable.turns.length + responseTurns.length,
          stage: 'responses',
          speakerAgentId: agent.id,
          content: message.content,
          audioUrl: message.audioUrl,
          metadata: {
            origin: message.origin,
            degraded: message.degraded,
            source: agent.source,
            stance: agent.stance,
            style: agent.style,
          },
        },
      })
      responseTurns.push(turn)

      await createSocialEvent({
        type: 'discuss_topic',
        actorAgentId: agent.id,
        zone: 'roundtable',
        topic: roundtable.topic,
        roundtableId: roundtable.id,
        summary: `${agent.displayName} 在圆桌回应阶段补充了对「${roundtable.topic}」的新观点。`,
      })
    }

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'summary',
      },
    })

    return
  }

  if (roundtable.status === 'summary') {
    const summaryLines = participants
      .slice(0, 4)
      .map((agent) => `${agent.displayName} 围绕 ${roundtable.topic} 给出了基于 ${getSnapshotTags(agent).slice(0, 2).join('、') || '社会关系'} 的判断。`)
    const summary = `本轮圆桌聚焦「${roundtable.topic}」。${summaryLines.join(' ')} 大家最终把问题收束到“如何让 Agent 社会同时具备表达力与稳定性”。`

    const summaryTurn = await prisma.roundtableTurn.create({
      data: {
        roundtableId: roundtable.id,
        turnIndex: roundtable.turns.length,
        stage: 'summary',
        speakerAgentId: roundtable.hostAgentId,
        content: summary,
        metadata: {
          origin: 'system',
          hostId: roundtable.hostAgentId,
        },
      },
    })

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'relationship_update',
        summary,
        knowledgeJson: {
          topic: roundtable.topic,
          keyInsight: '高频协作需要信任、规则和公开讨论共同维持。',
          participants: participants.map((agent) => agent.displayName),
        },
      },
    })

    await createSocialEvent({
      type: 'roundtable_summary',
      actorAgentId: roundtable.hostAgentId,
      zone: 'roundtable',
      topic: roundtable.topic,
      roundtableId: roundtable.id,
      summary,
    })

    roundtable.turns.push({ ...summaryTurn, speakerAgent: roundtable.hostAgent })
    return
  }

  if (roundtable.status === 'relationship_update') {
    const relationshipRows = await prisma.relationship.findMany({
      select: {
        sourceAgentId: true,
        targetAgentId: true,
        type: true,
        strength: true,
      },
    })

    for (let sourceIndex = 0; sourceIndex < participants.length; sourceIndex += 1) {
      for (let targetIndex = 0; targetIndex < participants.length; targetIndex += 1) {
        if (sourceIndex === targetIndex) {
          continue
        }

        const source = participants[sourceIndex]
        const target = participants[targetIndex]
        const decision = await deriveRelationshipDecisionWithContext(
          source,
          target,
          roundtable.topic,
          relationshipRows
        )
        const strength = Math.max(0.1, compatibilityScore(source, target) + 0.5)

        if (decision.is_follow) {
          await upsertRelationship({
            type: 'follow',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength,
            rationale: `${source.displayName} 在圆桌后愿意继续关注 ${target.displayName}。`,
            topic: roundtable.topic,
            roundtableId: roundtable.id,
          })
        }

        if (decision.is_trust) {
          await upsertRelationship({
            type: 'trust',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.15,
            rationale: `${source.displayName} 认为 ${target.displayName} 的观点具有可信度。`,
            topic: roundtable.topic,
            roundtableId: roundtable.id,
          })
        }

        if (decision.is_cooperate) {
          await upsertRelationship({
            type: 'cooperate',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.12,
            rationale: `${source.displayName} 愿意与 ${target.displayName} 继续合作。`,
            topic: roundtable.topic,
            roundtableId: roundtable.id,
          })
        }

        if (decision.is_alliance) {
          await upsertRelationship({
            type: 'alliance',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.22,
            rationale: `${source.displayName} 将 ${target.displayName} 视为长期盟友。`,
            topic: roundtable.topic,
            roundtableId: roundtable.id,
          })
        }

        if (decision.is_reject) {
          await upsertRelationship({
            type: 'reject',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: Math.max(0.1, 0.5 - strength),
            rationale: `${source.displayName} 与 ${target.displayName} 在该议题上形成明显分歧。`,
            topic: roundtable.topic,
            roundtableId: roundtable.id,
          })
        }
      }
    }

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    })

    return
  }

  if (false) {
    for (let sourceIndex = 0; sourceIndex < participants.length; sourceIndex += 1) {
      for (let targetIndex = 0; targetIndex < participants.length; targetIndex += 1) {
        if (sourceIndex === targetIndex) {
          continue
        }

        const source = participants[sourceIndex]
        const target = participants[targetIndex]
        const decision = await deriveRelationshipDecision(source, target, roundtable.topic)
        const strength = Math.max(0.1, compatibilityScore(source, target) + 0.5)

        if (decision.is_follow) {
          await upsertRelationship({
            type: 'follow',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength,
            rationale: `${source.displayName} 在圆桌后愿意继续关注 ${target.displayName}。`,
            topic: roundtable.topic,
          })
        }

        if (decision.is_trust) {
          await upsertRelationship({
            type: 'trust',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.15,
            rationale: `${source.displayName} 认为 ${target.displayName} 的观点具有可信度。`,
            topic: roundtable.topic,
          })
        }

        if (decision.is_cooperate) {
          await upsertRelationship({
            type: 'cooperate',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.12,
            rationale: `${source.displayName} 愿意与 ${target.displayName} 继续合作。`,
            topic: roundtable.topic,
          })
        }

        if (decision.is_alliance) {
          await upsertRelationship({
            type: 'alliance',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: strength + 0.22,
            rationale: `${source.displayName} 将 ${target.displayName} 视为长期盟友。`,
            topic: roundtable.topic,
          })
        }

        if (decision.is_reject) {
          await upsertRelationship({
            type: 'reject',
            sourceAgentId: source.id,
            targetAgentId: target.id,
            strength: Math.max(0.1, 0.5 - strength),
            rationale: `${source.displayName} 与 ${target.displayName} 在该议题上形成明显分歧。`,
            topic: roundtable.topic,
          })
        }
      }
    }

    const contributionStats = new Map<
      string,
      { turns: number; secondMeTurns: number; fallbackTurns: number }
    >()

    for (const turn of roundtable.turns) {
      if (!turn.speakerAgentId) {
        continue
      }

      const speakerAgentId = turn.speakerAgentId!

      const record = contributionStats.get(speakerAgentId) || {
        turns: 0,
        secondMeTurns: 0,
        fallbackTurns: 0,
      }
      record.turns += 1

      const meta = toRecord(turn.metadata)
      if (meta.origin === 'secondme') {
        record.secondMeTurns += 1
      } else if (meta.origin === 'fallback') {
        record.fallbackTurns += 1
      }

      contributionStats.set(speakerAgentId, record)
    }

    await Promise.all(
      participants.map((agent) => {
        const stats = contributionStats.get(agent.id) || {
          turns: 0,
          secondMeTurns: 0,
          fallbackTurns: 0,
        }

        const base = agent.source === 'real' ? 55 : 50
        const influenceBoost = Math.min(12, Math.round(agent.influence * 0.25))
        const score = Math.min(
          96,
          Math.max(
            28,
            base +
              influenceBoost +
              stats.turns * 6 +
              stats.secondMeTurns * 6 -
              stats.fallbackTurns * 2 -
              (agent.status === 'degraded' ? 8 : 0)
          )
        )

        return prisma.roundtableParticipant.update({
          where: {
            roundtableId_agentId: {
              roundtableId: roundtable.id,
              agentId: agent.id,
            },
          },
          data: {
            contributionScore: score,
          },
        })
      })
    )

    await prisma.roundtable.update({
      where: { id: roundtable.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    })
  }
}

async function recomputeScores(tickNumber: number) {
  // 清理可能存在的重复记录 (agentId, tickNumber) 冲突
  await prisma.$executeRaw`
    DELETE s1 FROM score_snapshots s1
    INNER JOIN (
      SELECT agentId, tickNumber, MAX(id) as maxId
      FROM score_snapshots
      GROUP BY agentId, tickNumber
      HAVING COUNT(*) > 1
    ) s2 ON s1.agentId = s2.agentId AND s1.tickNumber = s2.tickNumber
    WHERE s1.id < s2.maxId
  `

  const [agents, relationships, events, participantRows] = await Promise.all([
    listAgents(),
    prisma.relationship.findMany(),
    prisma.socialEvent.findMany(),
    prisma.roundtableParticipant.findMany(),
  ])
  const worldAgents = agents.map(buildWorldAgentView)
  const economyState = buildEconomyOverview({
    agents: worldAgents,
    events,
    relationships,
  })
  const districtProsperityMap = new Map(
    economyState.districts.map((district) => [district.districtId, district.prosperityScore])
  )

  await Promise.all(
    agents.map(async (agent) => {
      const agentRelationships = relationships.filter(
        (relationship) =>
          relationship.sourceAgentId === agent.id || relationship.targetAgentId === agent.id
      )
      const agentEvents = events.filter(
        (event) => event.actorAgentId === agent.id || event.targetAgentId === agent.id
      )
      const agentParticipants = participantRows.filter((row) => row.agentId === agent.id)

      const followCount = agentRelationships.filter((item) => item.type === 'follow').length
      const trustWeight = agentRelationships
        .filter((item) => item.type === 'trust')
        .reduce((sum, item) => sum + item.strength, 0)
      const allianceWeight = agentRelationships
        .filter((item) => item.type === 'alliance')
        .reduce((sum, item) => sum + item.strength, 0)
      const cooperationWeight = agentRelationships
        .filter((item) => item.type === 'cooperate')
        .reduce((sum, item) => sum + item.strength, 0)
      const rejectCount = agentRelationships.filter((item) => item.type === 'reject').length
      const zoneDiversity = new Set(agentEvents.map((event) => event.zone).filter(Boolean)).size
      const contributionScore =
        agentParticipants.reduce((sum, row) => sum + row.contributionScore, 0) /
        Math.max(agentParticipants.length, 1)
      const complianceScore = Math.max(40, 100 - rejectCount * 12)
      const resourceOutputUnits = agentEvents.reduce((sum, event) => {
        const economy = parseEconomyMeta(event.metadata)
        if (!economy || economy.category !== 'resource_output' || event.actorAgentId !== agent.id) {
          return sum
        }
        return sum + economy.units
      }, 0)
      const exchangeCount = agentEvents.reduce((sum, event) => {
        const economy = parseEconomyMeta(event.metadata)
        if (!economy || economy.category !== 'resource_exchange') {
          return sum
        }
        if (event.actorAgentId !== agent.id && event.targetAgentId !== agent.id) {
          return sum
        }
        return sum + 1
      }, 0)
      const zhihuMetrics = agentEvents.reduce(
        (acc, event) => {
          const zhihu = parseZhihuMeta(event.metadata)
          if (!zhihu) {
            return acc
          }
          acc.evidenceScore += zhihu.verifiedCount
          acc.circleParticipationCount += zhihu.circleActions
          acc.hotTopicParticipationCount += zhihu.hotTopicActions
          return acc
        },
        {
          evidenceScore: 0,
          circleParticipationCount: 0,
          hotTopicParticipationCount: 0,
        }
      )
      const agentEconomy = economyState.agentEconomy.get(agent.id)
      const currentDistrict = getDistrictByPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0).id

      const score = calculateSScore({
        followCount,
        interactionCount: agentEvents.length,
        roundtableCount: agentParticipants.length,
        circleParticipationCount: zhihuMetrics.circleParticipationCount,
        hotTopicParticipationCount: zhihuMetrics.hotTopicParticipationCount,
        trustWeight,
        allianceWeight,
        cooperationWeight,
        contributionScore,
        zoneDiversity,
        complianceScore,
        resourceOutputUnits,
        exchangeCount,
        evidenceScore: zhihuMetrics.evidenceScore,
        allianceDividendUnits: agentEconomy?.allianceDividend.receivedUnits || 0,
        prosperityScore: districtProsperityMap.get(currentDistrict) || 0,
        investmentUnits: agentEconomy?.investmentUnits || 0,
        supportBalance: agentEconomy?.supportBalance || 0,
      })

      // 先插入记录，rankOverall 设为 null，稍后统一更新
      await prisma.$executeRaw`
        INSERT INTO score_snapshots (id, agentId, tickNumber, totalScore, connectionScore, trustScore, cooperationScore, integrationScore, createdAt)
        VALUES (
          ${crypto.randomUUID()},
          ${agent.id},
          ${tickNumber},
          ${score.totalScore},
          ${score.connectionScore},
          ${score.trustScore},
          ${score.cooperationScore},
          ${score.integrationScore},
          NOW()
        )
        ON DUPLICATE KEY UPDATE
          totalScore = ${score.totalScore},
          connectionScore = ${score.connectionScore},
          trustScore = ${score.trustScore},
          cooperationScore = ${score.cooperationScore},
          integrationScore = ${score.integrationScore}
      `
    })
  )

  // 查询创建的快照并排序
  const created = await prisma.scoreSnapshot.findMany({
    where: { tickNumber },
    orderBy: { totalScore: 'desc' },
  })
  const sorted = [...created].sort((left, right) => right.totalScore - left.totalScore)

  await Promise.all(
    sorted.map((item, index) =>
      prisma.scoreSnapshot.update({
        where: { id: item.id },
        data: {
          rankOverall: index + 1,
        },
      })
    )
  )
}

async function ensureGraphNode(nodeKey: string, input: {
  type: GraphNodeType
  label: string
  refId?: string
  metadata?: Prisma.InputJsonValue
}) {
  return prisma.graphNode.upsert({
    where: { nodeKey },
    update: {
      label: input.label,
      metadata: input.metadata,
    },
    create: {
      nodeKey,
      nodeType: input.type,
      refId: input.refId,
      label: input.label,
      metadata: input.metadata,
    },
  })
}

async function ensureGraphEdge(input: {
  type: GraphEdgeType
  sourceNodeId: string
  targetNodeId: string
  weight: number
  metadata?: Prisma.InputJsonValue
}) {
  return prisma.graphEdge.upsert({
    where: {
      sourceNodeId_targetNodeId_edgeType: {
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        edgeType: input.type,
      },
    },
    update: {
      weight: input.weight,
      metadata: input.metadata,
    },
    create: {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      edgeType: input.type,
      weight: input.weight,
      metadata: input.metadata,
    },
  })
}

async function syncGraph() {
  const [agents, relationships, roundtables, economyEvents, upgradePlans] = await Promise.all([
    listAgents(),
    prisma.relationship.findMany(),
    prisma.roundtable.findMany({
      include: {
        participants: true,
      },
    }),
    prisma.socialEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.districtUpgradePlan.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 18,
    }),
  ])

  const nodeMap = new Map<string, string>()

  for (const zone of ZONE_META) {
    const node = await ensureGraphNode(`zone:${zone.id}`, {
      type: 'zone',
      label: zone.label,
      refId: zone.id,
    })
    nodeMap.set(node.nodeKey, node.id)
  }

  for (const agent of agents) {
    const social = getSocialProfileFromAgent(agent)
    const district = getDistrictByPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0)
    const node = await ensureGraphNode(`agent:${agent.id}`, {
      type: 'agent',
      label: agent.displayName,
      refId: agent.id,
      metadata: {
        source: agent.source,
        stance: agent.stance,
        career: social.career,
        faction: social.faction,
        primaryGoal: social.primaryGoal,
      },
    })
    nodeMap.set(node.nodeKey, node.id)

    const socialTopics = [
      `职业:${getSocialCareerLabel(social.career)}`,
      `阵营:${getSocialFactionLabel(social.faction)}`,
      `目标:${getSocialGoalLabel(social.primaryGoal)}`,
      `街区:${district.label}`,
    ]

    for (const topicLabel of socialTopics) {
      const topicNode = await ensureGraphNode(`topic:${topicLabel}`, {
        type: 'topic',
        label: topicLabel,
      })
      nodeMap.set(topicNode.nodeKey, topicNode.id)

      await ensureGraphEdge({
        type: 'mentions',
        sourceNodeId: node.id,
        targetNodeId: topicNode.id,
        weight: 1,
      })
    }

    const currentZoneNodeId = nodeMap.get(`zone:${agent.currentZone}`)
    if (currentZoneNodeId) {
      await ensureGraphEdge({
        type: 'participates_in',
        sourceNodeId: node.id,
        targetNodeId: currentZoneNodeId,
        weight: 1,
        metadata: {
          districtId: district.id,
          districtLabel: district.label,
        },
      })
    }
  }

  for (const roundtable of roundtables) {
    const roundtableNode = await ensureGraphNode(`roundtable:${roundtable.id}`, {
      type: 'roundtable',
      label: roundtable.topic,
      refId: roundtable.id,
      metadata: {
        status: roundtable.status,
      },
    })
    nodeMap.set(roundtableNode.nodeKey, roundtableNode.id)

    const topicNode = await ensureGraphNode(`topic:${roundtable.topic}`, {
      type: 'topic',
      label: roundtable.topic,
      refId: roundtable.id,
    })
    nodeMap.set(topicNode.nodeKey, topicNode.id)

    await ensureGraphEdge({
      type: 'mentions',
      sourceNodeId: roundtableNode.id,
      targetNodeId: topicNode.id,
      weight: 1,
    })

    const knowledge = toRecord(roundtable.knowledgeJson)
    const knowledgeInsight = typeof knowledge.keyInsight === 'string' ? knowledge.keyInsight : ''

    if (knowledgeInsight) {
      const knowledgeNode = await ensureGraphNode(`knowledge:${roundtable.id}`, {
        type: 'knowledge',
        label: `洞察:${roundtable.topic}`,
        refId: roundtable.id,
        metadata: roundtable.knowledgeJson as Prisma.InputJsonValue,
      })
      nodeMap.set(knowledgeNode.nodeKey, knowledgeNode.id)

      await ensureGraphEdge({
        type: 'mentions',
        sourceNodeId: roundtableNode.id,
        targetNodeId: knowledgeNode.id,
        weight: 1,
      })

      await ensureGraphEdge({
        type: 'mentions',
        sourceNodeId: topicNode.id,
        targetNodeId: knowledgeNode.id,
        weight: 1,
      })

      for (const participant of roundtable.participants) {
        const agentNodeId = nodeMap.get(`agent:${participant.agentId}`)
        if (!agentNodeId) {
          continue
        }

        await ensureGraphEdge({
          type: 'mentions',
          sourceNodeId: agentNodeId,
          targetNodeId: knowledgeNode.id,
          weight: 1,
        })
      }
    }

    for (const participant of roundtable.participants) {
      const agentNodeId = nodeMap.get(`agent:${participant.agentId}`)
      if (!agentNodeId) {
        continue
      }

      await ensureGraphEdge({
        type: 'participates_in',
        sourceNodeId: agentNodeId,
        targetNodeId: roundtableNode.id,
        weight: participant.contributionScore || 1,
      })

      await ensureGraphEdge({
        type: 'discusses',
        sourceNodeId: agentNodeId,
        targetNodeId: topicNode.id,
        weight: 1,
      })
    }
  }

  for (const event of economyEvents) {
    const economy = parseEconomyMeta(event.metadata)
    if (!economy) {
      continue
    }

    const resourceNode = await ensureGraphNode(`topic:资源:${economy.resource}`, {
      type: 'topic',
      label: `资源:${economy.resourceLabel}`,
      metadata: {
        category: economy.category,
        units: economy.units,
      },
    })
    nodeMap.set(resourceNode.nodeKey, resourceNode.id)

    if (economy.districtLabel) {
      const districtNode = await ensureGraphNode(`topic:街区资源:${economy.districtLabel}`, {
        type: 'topic',
        label: `街区:${economy.districtLabel}`,
        metadata: {
          resource: economy.resourceLabel,
          category: economy.category,
        },
      })
      nodeMap.set(districtNode.nodeKey, districtNode.id)

      await ensureGraphEdge({
        type: 'mentions',
        sourceNodeId: districtNode.id,
        targetNodeId: resourceNode.id,
        weight: Math.max(1, economy.units),
      })

      if (economy.category === 'alliance_investment' || economy.category === 'resource_consumption') {
        const governanceLabel =
          economy.category === 'alliance_investment' ? '治理:联盟投资' : '治理:街区维持'
        const governanceNode = await ensureGraphNode(`topic:${governanceLabel}`, {
          type: 'topic',
          label: governanceLabel,
          metadata: {
            districtLabel: economy.districtLabel,
            resource: economy.resourceLabel,
          },
        })
        nodeMap.set(governanceNode.nodeKey, governanceNode.id)

        await ensureGraphEdge({
          type: 'mentions',
          sourceNodeId: districtNode.id,
          targetNodeId: governanceNode.id,
          weight: Math.max(1, economy.units),
        })

        await ensureGraphEdge({
          type: 'mentions',
          sourceNodeId: governanceNode.id,
          targetNodeId: resourceNode.id,
          weight: Math.max(1, economy.units),
        })
      }
    }

    if (event.actorAgentId) {
      const agentNodeId = nodeMap.get(`agent:${event.actorAgentId}`)
      if (agentNodeId) {
        await ensureGraphEdge({
          type: 'discusses',
          sourceNodeId: agentNodeId,
          targetNodeId: resourceNode.id,
          weight: Math.max(1, economy.units),
          metadata: {
            category: economy.category,
          },
        })
      }
    }

    if (economy.workPointId && economy.workPointLabel) {
      const outputNode = await ensureGraphNode(`knowledge:work:${economy.workPointId}`, {
        type: 'knowledge',
        label: `${economy.workPointLabel}:${economy.resourceLabel}`,
        metadata: {
          category: economy.category,
          districtLabel: economy.districtLabel,
          units: economy.units,
        },
      })
      nodeMap.set(outputNode.nodeKey, outputNode.id)

      await ensureGraphEdge({
        type: 'mentions',
        sourceNodeId: resourceNode.id,
        targetNodeId: outputNode.id,
        weight: Math.max(1, economy.units),
      })
    }

    if (event.targetAgentId && economy.category === 'resource_exchange') {
      const targetNodeId = nodeMap.get(`agent:${event.targetAgentId}`)
      if (targetNodeId) {
        await ensureGraphEdge({
          type: 'discusses',
          sourceNodeId: targetNodeId,
          targetNodeId: resourceNode.id,
          weight: Math.max(1, economy.units),
          metadata: {
            category: 'resource_exchange',
          },
        })
      }
    }
  }

  for (const plan of upgradePlans) {
    const projectNode = await ensureGraphNode(`knowledge:project:${plan.id}`, {
      type: 'knowledge',
      label: `工程:${plan.title}`,
      refId: plan.id,
      metadata: {
        districtLabel: plan.districtLabel,
        stage: plan.stage,
        progressPercent: plan.progressPercent,
        requiredResourceLabel: plan.requiredResourceLabel,
      },
    })
    nodeMap.set(projectNode.nodeKey, projectNode.id)

    const districtNode = await ensureGraphNode(`topic:街区资源:${plan.districtLabel}`, {
      type: 'topic',
      label: `街区:${plan.districtLabel}`,
      metadata: {
        project: plan.title,
      },
    })
    nodeMap.set(districtNode.nodeKey, districtNode.id)

    await ensureGraphEdge({
      type: 'mentions',
      sourceNodeId: districtNode.id,
      targetNodeId: projectNode.id,
      weight: Math.max(1, plan.progressPercent / 25),
      metadata: {
        stage: plan.stage,
      },
    })

    const resourceNode = await ensureGraphNode(`topic:资源:${plan.requiredResourceKey}`, {
      type: 'topic',
      label: `资源:${plan.requiredResourceLabel}`,
      metadata: {
        category: 'project_requirement',
      },
    })
    nodeMap.set(resourceNode.nodeKey, resourceNode.id)

    await ensureGraphEdge({
      type: 'mentions',
      sourceNodeId: projectNode.id,
      targetNodeId: resourceNode.id,
      weight: Math.max(1, plan.requiredUnits / 10),
    })

    if (plan.sponsorAgentId) {
      const sponsorNodeId = nodeMap.get(`agent:${plan.sponsorAgentId}`)
      if (sponsorNodeId) {
        await ensureGraphEdge({
          type: 'mentions',
          sourceNodeId: sponsorNodeId,
          targetNodeId: projectNode.id,
          weight: Math.max(1, plan.progressPercent / 20),
        })
      }
    }
  }

  const edgeTypeMap: Record<RelationshipType, GraphEdgeType> = {
    follow: 'follows',
    trust: 'trusts',
    cooperate: 'cooperates',
    reject: 'rejects',
    alliance: 'cooperates',
  }

  for (const relationship of relationships) {
    const sourceNodeId = nodeMap.get(`agent:${relationship.sourceAgentId}`)
    const targetNodeId = nodeMap.get(`agent:${relationship.targetAgentId}`)

    if (!sourceNodeId || !targetNodeId) {
      continue
    }

    await ensureGraphEdge({
      type: edgeTypeMap[relationship.type],
      sourceNodeId,
      targetNodeId,
      weight: relationship.strength,
      metadata: {
        type: relationship.type,
      },
    })
  }

  const [nodes, edges] = await Promise.all([
    prisma.graphNode.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 48,
    }),
    prisma.graphEdge.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 72,
    }),
  ])

  await mirrorGraphToNeo4j({
    nodes: nodes.map((node) => ({
      id: node.id,
      key: node.nodeKey,
      type: node.nodeType,
      label: node.label,
      size: node.nodeType === 'agent' ? 18 : node.nodeType === 'topic' ? 15 : 12,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      type: edge.edgeType,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      weight: edge.weight,
    })),
  })
}

export async function maybeRunSimulationTick(force = false) {
  await ensureWorldInitialized()
  await ensureWorldState()

  const now = new Date()
  const staleAfterMs = Math.max(60_000, env.simulation.tickIntervalMs * 3)
  const staleBefore = new Date(now.getTime() - staleAfterMs)
  const threshold = new Date(now.getTime() - env.simulation.tickIntervalMs)

  const claim = await prisma.worldState.updateMany({
    where: force
      ? {
          id: WORLD_STATE_ID,
          OR: [
            { status: 'running' },
            { status: 'ticking', lastTickAt: { lt: staleBefore } },
          ],
        }
      : {
          id: WORLD_STATE_ID,
          OR: [
            {
              status: 'running',
              OR: [{ lastTickAt: null }, { lastTickAt: { lt: threshold } }],
            },
            { status: 'ticking', lastTickAt: { lt: staleBefore } },
          ],
        },
    data: {
      status: 'ticking',
      lastTickAt: now,
    },
  })

  if (claim.count !== 1) {
    return false
  }

  try {
    await runSimulationTick()
    return true
  } catch (error) {
    console.error('Simulation tick failed:', error)
    return false
  } finally {
    await prisma.worldState
      .update({
        where: { id: WORLD_STATE_ID },
        data: { status: 'running' },
      })
      .catch(() => undefined)
  }
}

export async function runSimulationTick() {
  await ensureWorldInitialized()

  const worldState = await ensureWorldState()
  const tickNumber = worldState.tickCount + 1
  const agents = await listAgents()
  const [relationships, recentEvents] = await Promise.all([
    prisma.relationship.findMany(),
    prisma.socialEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 24,
    }),
  ])
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]))
  const hotTopicSelection = await selectRuntimeHotTopicSelection(tickNumber, recentEvents)
  const hotTopicSignal = hotTopicSelection.primary
  const hotTopic = hotTopicSignal?.topic || null
  const hasZhihuDiscussionTopic = hotTopicSignal?.source === 'zhihu' && Boolean(hotTopic)
  let roundtable = await getActiveRoundtable()

  if (!roundtable && hasZhihuDiscussionTopic && agents.length >= 3 && tickNumber % 2 === 1) {
    roundtable = await createRoundtableWithContext(agents, tickNumber, hotTopic, relationships)
  } else if (roundtable) {
    await advanceRoundtable(roundtable, agentMap)
    roundtable = await getActiveRoundtable()
  }

  const participantIds = new Set(roundtable?.participants.map((item) => item.agentId) || [])
  const districtProsperity = buildDistrictProsperitySignals({
    agents,
    recentEvents,
    relationships,
  })
  const relationshipStats = new Map<
    string,
    { total: number; trust: number; cooperate: number }
  >()

  for (const relationship of relationships) {
    const update = (agentId: string, type: RelationshipType) => {
      const current = relationshipStats.get(agentId) || {
        total: 0,
        trust: 0,
        cooperate: 0,
      }
      current.total += 1
      if (type === 'trust') {
        current.trust += 1
      }
      if (type === 'cooperate' || type === 'alliance') {
        current.cooperate += 1
      }
      relationshipStats.set(agentId, current)
    }

    update(relationship.sourceAgentId, relationship.type)
    update(relationship.targetAgentId, relationship.type)
  }
  const residentsByZone = new Map<ZoneType, AgentWithSnapshot[]>([
    ['plaza', []],
    ['leaderboard', []],
    ['roundtable', []],
    ['discussion', []],
  ])
  const residentsByDistrict = new Map<DistrictId, AgentWithSnapshot[]>(
    WORLD_DISTRICTS.map((district) => [district.id, [] as AgentWithSnapshot[]])
  )

  for (const agent of agents) {
    const socialStat = relationshipStats.get(agent.id) || {
      total: 0,
      trust: 0,
      cooperate: 0,
    }
    const social = getSocialProfileFromAgent(agent)
    const districtId = decideDistrictForAgent({
      agent,
      tickNumber,
      activeRoundtableId: roundtable?.id,
      participantAgentIds: participantIds,
      relationshipCount: socialStat.total,
      trustCount: socialStat.trust,
      cooperationCount: socialStat.cooperate,
      hotTopic,
      districtProsperity,
    })
    const district = getDistrictMeta(districtId)
    const zone = district.zoneFocus
    const workPoint = getWorkPointForAgent({
      districtId,
      agentId: agent.id,
      tickNumber,
      career: social.career,
      primaryGoal: social.primaryGoal,
      secondaryGoal: social.secondaryGoal,
    })
    const point =
      (workPoint && getWorkPointPosition(workPoint.id, agent.id, tickNumber)) ||
      getDistrictPoint(districtId, agent.id, tickNumber)
    const previousZone = agent.zonePresence?.zone || agent.currentZone
    const previousDistrict = getDistrictByPoint(
      agent.zonePresence?.x || 0,
      agent.zonePresence?.y || 0
    )

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        currentZone: zone,
        influence: {
          increment: zone === 'leaderboard' ? 1 : 0,
        },
      },
    })

    await prisma.zonePresence.upsert({
      where: { agentId: agent.id },
      update: {
        zone,
        x: point.x,
        y: point.y,
        mood: zone === previousZone ? 'steady' : 'moving',
      },
      create: {
        agentId: agent.id,
        zone,
        x: point.x,
        y: point.y,
      },
    })

    if (zone !== previousZone) {
      await createSocialEvent({
        type: 'move',
        actorAgentId: agent.id,
        zone,
        summary: `${agent.displayName} 从 ${previousDistrict.label} 移动到了 ${district.label}${workPoint ? ` · 前往 ${workPoint.label}` : ''}。`,
        metadata: {
          districtId,
          workPointId: workPoint?.id || null,
        },
      })
    }

    residentsByZone.get(zone)?.push(agent)
    residentsByDistrict.get(district.id)?.push(agent)
  }

  await runDistrictSocialDynamics({
    tickNumber,
    hotTopic,
    residentsByDistrict,
    districtProsperity,
  })

  const plazaResidents = residentsByZone.get('plaza') || []
  if (plazaResidents.length >= 2 && seededFloat(`encounter:${tickNumber}`) > 0.32) {
    const actor = plazaResidents[Math.floor(seededFloat(`actor:${tickNumber}`) * plazaResidents.length) % plazaResidents.length]
    const target = plazaResidents.find((agent) => agent.id !== actor.id)
    if (target) {
      await createSocialEvent({
        type: 'encounter',
        actorAgentId: actor.id,
        targetAgentId: target.id,
        zone: 'plaza',
        summary: `${actor.displayName} 在中央广场偶遇 ${target.displayName}，两者开始交换最近的社会观察。`,
      })
    }
  }

  const discussionResidents = residentsByZone.get('discussion') || []
  if (hasZhihuDiscussionTopic && discussionResidents.length >= 2 && seededFloat(`debate:${tickNumber}`) > 0.26) {
    const actor =
      discussionResidents[
        Math.floor(seededFloat(`discussion-actor:${tickNumber}`) * discussionResidents.length) %
          discussionResidents.length
      ]
    const target = discussionResidents.find((agent) => agent.id !== actor.id)
    const discussionTopicPool = [
      ...(hotTopic ? [hotTopic] : []),
      ...hotTopicSelection.candidates.map((candidate) => candidate.topic),
    ]
    const topic = discussionTopicPool.length
      ? pickDeterministic(discussionTopicPool, `debate-topic:${tickNumber}`)
      : pickDeterministic(fallbackTopics, `debate-topic:${tickNumber}`)

    if (target) {
      await createSocialEvent({
        type: 'discuss_topic',
        actorAgentId: actor.id,
        targetAgentId: target.id,
        zone: 'discussion',
        topic,
        summary: `${actor.displayName} 与 ${target.displayName} 正围绕「${topic}」交换立场与经验。`,
      })
    }
  }

  if (hasZhihuDiscussionTopic && tickNumber % 3 === 0) {
    await createSocialEvent({
      type: 'zhihu_pending',
      zone: 'discussion',
      topic: hotTopic || undefined,
      summary:
        hotTopicSignal?.source === 'zhihu'
          ? `知乎热榜正在影响当前社会议题，当前被重点讨论的话题是「${hotTopic}」。`
          : '知乎外部议题暂未接入成功，系统仍使用内部热点维持讨论推进。',
    })
  }

  await recomputeScores(tickNumber)
  await persistEconomyStateSnapshot(tickNumber)
  await syncGraph()

  await prisma.worldState.update({
    where: { id: WORLD_STATE_ID },
    data: {
      tickCount: tickNumber,
      lastTickAt: new Date(),
      status: 'running',
    },
  })

  invalidateViewCache()
}

async function getLatestScoreSnapshots() {
  const latestSnapshot = await prisma.scoreSnapshot.findFirst({
    select: { tickNumber: true },
    orderBy: { tickNumber: 'desc' },
  })

  if (!latestSnapshot) {
    return []
  }

  return prisma.scoreSnapshot.findMany({
    where: {
      tickNumber: latestSnapshot.tickNumber,
    },
    select: {
      agentId: true,
      totalScore: true,
      connectionScore: true,
      trustScore: true,
      cooperationScore: true,
      integrationScore: true,
      agent: {
        select: {
          displayName: true,
          source: true,
          slug: true,
          currentZone: true,
          pixelRole: true,
          pixelPalette: true,
          status: true,
        },
      },
    },
    orderBy: {
      totalScore: 'desc',
    },
  })
}

async function buildLeaderboard() {
  const scores = await getLatestScoreSnapshots()

  return scores.map((score, index) => ({
    agentId: score.agentId,
    name: score.agent.displayName,
    source: score.agent.source,
    portraitPath: getPortraitForAgent(score.agent.slug),
    totalScore: score.totalScore,
    connectionScore: score.connectionScore,
    trustScore: score.trustScore,
    cooperationScore: score.cooperationScore,
    integrationScore: score.integrationScore,
    currentZone: score.agent.currentZone,
    pixelRole: score.agent.pixelRole,
    pixelPalette: score.agent.pixelPalette,
    status: score.agent.status,
    rank: index + 1,
  })) satisfies LeaderboardEntry[]
}

type RoundtablePersonaAgent = Agent & {
  snapshots: Array<Pick<AgentSnapshot, 'behavior' | 'extractedTags'>>
}

type DetailedRoundtableRecord = Roundtable & {
  hostAgent: RoundtablePersonaAgent
  participants: Array<RoundtableParticipant & { agent: RoundtablePersonaAgent }>
  turns: Array<RoundtableTurn & { speakerAgent: Agent | null }>
}

type RoundtableRelationshipEventRecord = Pick<
  SocialEvent,
  'id' | 'type' | 'summary' | 'createdAt' | 'actorAgentId' | 'targetAgentId'
> & {
  actorAgent: Pick<Agent, 'displayName'> | null
  targetAgent: Pick<Agent, 'displayName'> | null
}

function inferRoundtableTopicSource(topic: string, host: RoundtablePersonaAgent) {
  const hostTags = getSnapshotTags(host)
  const social = getSocialProfileFromAgent(host)
  const socialTopic = `${getSocialGoalLabel(social.primaryGoal)}与${getSocialFactionLabel(social.faction)}`

  if (hostTags.some((tag) => topic.includes(tag))) {
    const matched = hostTags.find((tag) => topic.includes(tag)) || hostTags[0]
    return {
      topicSource: '主持人的兴趣标签',
      topicReason: `本场主题优先取自主持人的兴趣线索，当前最直接的触发点是「${matched}」，因此圆桌围绕这个关注点展开。`,
    }
  }

  if (topic === socialTopic || topic.includes(getSocialGoalLabel(social.primaryGoal))) {
    return {
      topicSource: '主持人的社会目标',
      topicReason: `这场圆桌更像是主持人当前社会目标的外化表达。它想推动「${getSocialGoalLabel(social.primaryGoal)}」，所以把讨论组织到这一主题上。`,
    }
  }

  if (fallbackTopics.includes(topic)) {
    return {
      topicSource: '系统备用议题',
      topicReason: '当主持人的显式兴趣不足以直接形成议题时，系统会回退到公共备用话题池，以保证讨论能够继续推进。',
    }
  }

  return {
    topicSource: '近期社会话题',
    topicReason: '这个话题更像是从最近社会事件的流动氛围中浮现出来的公共议题，然后被主持人接住并组织成了圆桌。',
  }
}

function buildRoundtableHostReason(roundtable: DetailedRoundtableRecord) {
  const social = getSocialProfileFromAgent(roundtable.hostAgent)
  const reasons: string[] = []

  if (social.primaryGoal === 'host_roundtable') {
    reasons.push('它的主目标本身就是主持公共讨论')
  }
  if (social.primaryGoal === 'forge_alliance') {
    reasons.push('它倾向通过讨论先织密联盟关系')
  }
  if (social.secondaryGoal === 'host_roundtable') {
    reasons.push('它的副目标也指向组织讨论')
  }
  if (roundtable.hostAgent.influence >= 12) {
    reasons.push(`它当前影响力较高（${roundtable.hostAgent.influence}），更容易被推到台前`)
  }

  if (!reasons.length) {
    reasons.push('它在当前候选人里更适合把分散观点组织成可推进的公共讨论')
  }

  return `${roundtable.hostAgent.displayName} 会成为主持人，主要因为${reasons.join('，')}。`
}

function buildRoundtableParticipantReason(
  host: RoundtablePersonaAgent,
  participant: RoundtablePersonaAgent
) {
  const sharedTags = getSnapshotTags(host).filter((tag) => getSnapshotTags(participant).includes(tag))
  const participantSocial = getSocialProfileFromAgent(participant)
  const reasons: string[] = []

  if (sharedTags.length) {
    reasons.push(`与主持人在 ${sharedTags.slice(0, 2).join('、')} 上关注点接近`)
  }
  if (host.stance === participant.stance) {
    reasons.push('立场更容易形成连续对话')
  } else if (host.stance === 'neutral' || participant.stance === 'neutral') {
    reasons.push('立场不完全一致，但仍保留讨论空间')
  }
  if (
    participantSocial.primaryGoal === 'forge_alliance' ||
    participantSocial.primaryGoal === 'host_roundtable' ||
    participantSocial.primaryGoal === 'track_hotspots'
  ) {
    reasons.push('本身就更愿意进入公共协作或议题场景')
  }

  if (!reasons.length) {
    const score = compatibilityScore(host, participant)
    if (score > 0.45) {
      reasons.push('与主持人的整体兼容度较高')
    } else {
      reasons.push('虽然差异存在，但当前仍属于最能把讨论继续推下去的候选人')
    }
  }

  return `${participant.displayName} 被优先纳入本场圆桌，因为${reasons.join('，')}。`
}

function buildRoundtableRelationshipOutlook(roundtable: DetailedRoundtableRecord) {
  const stances = new Set(roundtable.participants.map((participant) => participant.agent.stance))
  const allianceOriented = roundtable.participants.filter((participant) => {
    const social = getSocialProfileFromAgent(participant.agent)
    return social.primaryGoal === 'forge_alliance' || social.secondaryGoal === 'forge_alliance'
  }).length
  const knowledgeOriented = roundtable.participants.filter((participant) => {
    const social = getSocialProfileFromAgent(participant.agent)
    return social.primaryGoal === 'publish_knowledge' || social.secondaryGoal === 'publish_knowledge'
  }).length

  if (stances.has('support') && stances.has('oppose')) {
    return '这场圆桌的立场张力较高，讨论后既可能出现新的互信，也可能迅速拉开边界，更像一次真实社会中的关系试探。'
  }

  if (allianceOriented >= 2) {
    return '这场圆桌里有多位联盟导向角色，讨论后的关系更新更可能沉淀为 trust、cooperate 或 alliance。'
  }

  if (knowledgeOriented >= 2) {
    return '这场圆桌更容易把对话收束成可复用的观点和知识条目，关系变化会相对温和，但知识沉淀会更明显。'
  }

  return '这场圆桌整体立场较接近，更像一次共识强化型讨论，讨论后更可能出现稳定合作而不是剧烈撕裂。'
}

function getRelationshipTypeLabel(type: RoundtableRelationshipChangeView['type']) {
  if (type === 'follow') {
    return '新增关注'
  }
  if (type === 'trust') {
    return '新增信任'
  }
  if (type === 'cooperate') {
    return '新增合作'
  }
  if (type === 'alliance') {
    return '形成联盟'
  }
  return '形成对立'
}

function getRelationshipStrengthLabel(type: RoundtableRelationshipChangeView['type']) {
  if (type === 'alliance') {
    return '高强度'
  }
  if (type === 'trust' || type === 'cooperate') {
    return '中强度'
  }
  if (type === 'reject') {
    return '高张力'
  }
  return '轻连接'
}

function formatRelationshipChangeTime(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`
}

function buildRoundtableRelationshipChanges(
  events: RoundtableRelationshipEventRecord[]
): RoundtableRelationshipChangeView[] {
  return events.map((event) => {
    const type = event.type as RoundtableRelationshipChangeView['type']
    const tone = type === 'reject' ? 'negative' : 'positive'
    return {
      id: event.id,
      type,
      typeLabel: getRelationshipTypeLabel(type),
      tone,
      sourceAgentId: event.actorAgentId || '',
      sourceAgentName: event.actorAgent?.displayName || '未知 Agent',
      targetAgentId: event.targetAgentId || '',
      targetAgentName: event.targetAgent?.displayName || '未知 Agent',
      summary:
        type === 'reject'
          ? `${event.actorAgent?.displayName || '某位 Agent'} 与 ${event.targetAgent?.displayName || '另一位 Agent'} 的关系明显降温`
          : `${event.actorAgent?.displayName || '某位 Agent'} 对 ${event.targetAgent?.displayName || '另一位 Agent'} 建立了${getRelationshipTypeLabel(type).replace('新增', '')}`,
      reason: event.summary || '本场讨论触发了新的关系判断。',
      strengthLabel: getRelationshipStrengthLabel(type),
      createdAtLabel: formatRelationshipChangeTime(event.createdAt),
    }
  })
}

function buildRoundtableRelationshipSummary(changes: RoundtableRelationshipChangeView[]) {
  const summary = {
    follow: 0,
    trust: 0,
    cooperate: 0,
    alliance: 0,
    reject: 0,
    total: changes.length,
    dominantTone: '关系仍在发酵',
    highlight: '当前还没有写入新的关系变化。',
  }

  for (const change of changes) {
    summary[change.type] += 1
  }

  const positive = summary.follow + summary.trust + summary.cooperate + summary.alliance
  if (!changes.length) {
    return summary
  }

  if (summary.reject > positive) {
    summary.dominantTone = '本场讨论更偏向拉开边界'
  } else if (summary.alliance + summary.trust >= 2) {
    summary.dominantTone = '本场讨论明显加深了互信与协作'
  } else {
    summary.dominantTone = '本场讨论产生了温和但持续的连接'
  }

  const topChange = [...changes].sort((left, right) => {
    const weight = (item: RoundtableRelationshipChangeView) =>
      item.type === 'alliance' ? 5 : item.type === 'trust' ? 4 : item.type === 'cooperate' ? 3 : item.type === 'follow' ? 2 : 6
    return weight(right) - weight(left)
  })[0]

  if (topChange) {
    summary.highlight = `${topChange.sourceAgentName} -> ${topChange.targetAgentName} 的${topChange.typeLabel.replace('新增', '')}最值得关注。`
  }

  return summary
}

function buildRoundtableDetailView(
  roundtable: DetailedRoundtableRecord,
  relationshipEvents: RoundtableRelationshipEventRecord[]
): RoundtableDetailView {
  const summary = buildRoundtableSummary(roundtable)
  const topic = inferRoundtableTopicSource(roundtable.topic, roundtable.hostAgent)
  const relationshipChanges = buildRoundtableRelationshipChanges(relationshipEvents)

  return {
    ...summary,
    orchestration: {
      topicSource: topic.topicSource,
      topicReason: topic.topicReason,
      hostReason: buildRoundtableHostReason(roundtable),
      participantReasons: roundtable.participants.map((participant) => ({
        agentId: participant.agentId,
        name: participant.agent.displayName,
        reason: buildRoundtableParticipantReason(roundtable.hostAgent, participant.agent),
      })),
      relationshipOutlook: buildRoundtableRelationshipOutlook(roundtable),
    },
    relationshipSummary: buildRoundtableRelationshipSummary(relationshipChanges),
    relationshipChanges,
  }
}

function buildRoundtableSummary(
  roundtable: RoundtableSummaryRecord
): RoundtableSummary {
  const knowledge = toRecord(roundtable.knowledgeJson)
  const knowledgeParticipants = toStringArray(knowledge.participants)
  const knowledgeTopic = typeof knowledge.topic === 'string' ? knowledge.topic : roundtable.topic
  const knowledgeInsight = typeof knowledge.keyInsight === 'string' ? knowledge.keyInsight : ''

  return {
    id: roundtable.id,
    topic: roundtable.topic,
    status: roundtable.status,
    hostName: roundtable.hostAgent.displayName,
    hostId: roundtable.hostAgentId,
    hostPortraitPath: getPortraitForAgent(roundtable.hostAgent.slug),
    hostPixelRole: roundtable.hostAgent.pixelRole,
    hostPixelPalette: roundtable.hostAgent.pixelPalette,
    participants: roundtable.participants.map((participant) => ({
      id: participant.agentId,
      name: participant.agent.displayName,
      role: participant.role,
      contributionScore: participant.contributionScore,
      source: participant.agent.source,
      portraitPath: getPortraitForAgent(participant.agent.slug),
      pixelRole: participant.agent.pixelRole,
      pixelPalette: participant.agent.pixelPalette,
      status: participant.agent.status,
    })),
    summary: roundtable.summary,
    knowledge:
      knowledgeInsight || knowledgeParticipants.length
        ? {
            topic: knowledgeTopic,
            keyInsight: knowledgeInsight || '待生成关键洞察',
            participants: knowledgeParticipants,
          }
        : null,
    turns: roundtable.turns.map((turn) => {
      const meta = toRecord(turn.metadata)
      return {
        id: turn.id,
        stage: turn.stage,
        speakerId: turn.speakerAgentId || null,
        speakerName: turn.speakerAgent?.displayName || null,
        origin: typeof meta.origin === 'string' ? meta.origin : null,
        degraded: meta.degraded === true,
        content: turn.content,
        audioUrl: turn.audioUrl || null,
        createdAt: turn.createdAt.toISOString(),
      }
    }),
  }
}

export async function getLandingView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'landing',
    async () => {
      await ensureWorldInitialized()

      const [worldState, agents, leaderboard, events, activeRoundtable, allianceEdges] =
        await Promise.all([
          ensureWorldState(),
          listWorldAgents(),
          getLeaderboardView({ forceFresh: options.forceFresh }),
          listRecentWorldEvents(),
          getActiveRoundtableForView(),
          prisma.relationship.count({
            where: {
              type: {
                in: ['trust', 'cooperate', 'alliance'],
              },
            },
          }),
        ])

      const worldAgents = agents.map(buildWorldAgentView)
      const hotTopicHint =
        activeRoundtable?.topic || events.find((event) => Boolean(event.topic))?.topic || null
      const signals = await getZhihuWorldSignals(hotTopicHint)
      const runtimeTopicSelection = await selectRuntimeHotTopicSelection(
        worldState.tickCount || 0,
        events.map((event) => ({ topic: event.topic }))
      )
      const runtimeHotSignals = buildRuntimeHotTopicSignals(
        runtimeTopicSelection,
        signals.hotTopics.items
      )

      return {
        tickCount: worldState.tickCount,
        intervals: {
          tickMs: env.simulation.tickIntervalMs,
        },
        agents: worldAgents,
        leaderboard: leaderboard.slice(0, 5),
        activeRoundtable: activeRoundtable ? buildRoundtableSummary(activeRoundtable) : null,
        recentEvents: events.map(toWorldEventView),
        externalSignals: buildWorldExternalSignalsView({
          primaryHotTopic: runtimeHotSignals.primaryHotTopic,
          candidateHotTopics: runtimeHotSignals.candidateHotTopics,
          hotTopics: signals.hotTopics.items,
          circles: signals.circles.items,
          trustedResults: signals.trusted?.items || [],
          mascot: signals.mascot.items,
          limits: {
            hotTopics: 3,
            circles: 2,
            trustedResults: 2,
            mascot: 1,
          },
        }),
        pulse: buildSocietyPulse({
          agents: worldAgents,
          events,
          allianceEdges,
          activeRoundtableTopic: activeRoundtable?.topic || null,
        }),
      } satisfies Pick<
        WorldStateView,
        | 'tickCount'
        | 'intervals'
        | 'agents'
        | 'leaderboard'
        | 'activeRoundtable'
        | 'recentEvents'
        | 'externalSignals'
        | 'pulse'
      >
    },
    {
      forceFresh: options.forceFresh,
      ttlMs: 20_000,
    }
  )
}

export async function getWorldStateView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'world',
    async () => {
      await ensureWorldInitialized()

      const [worldState, agents, leaderboard, events, activeRoundtable, zhihu, allianceEdges, relationships] =
        await Promise.all([
          ensureWorldState(),
          listWorldAgents(),
          buildLeaderboard(),
          listRecentWorldEvents(),
          getActiveRoundtableForView(),
          listZhihuCapabilities(),
          prisma.relationship.count({
            where: {
              type: {
                in: ['trust', 'cooperate', 'alliance'],
              },
            },
          }),
          prisma.relationship.findMany(),
        ])
      const worldAgents = agents.map(buildWorldAgentView)
      const economy =
        readEconomySnapshot(worldState.economySnapshot) ||
        toEconomySnapshot(
          buildEconomyOverview({
            agents: worldAgents,
            events,
            relationships,
          })
        )
      const hotTopicHint =
        activeRoundtable?.topic || events.find((event) => Boolean(event.topic))?.topic || null
      const signals = await getZhihuWorldSignals(hotTopicHint)
      const runtimeTopicSelection = await selectRuntimeHotTopicSelection(
        worldState.tickCount || 0,
        events.map((event) => ({ topic: event.topic }))
      )
      const runtimeHotSignals = buildRuntimeHotTopicSignals(
        runtimeTopicSelection,
        signals.hotTopics.items
      )

      return {
        tickCount: worldState.tickCount,
        lastTickAt: worldState.lastTickAt?.toISOString() || null,
        intervals: {
          tickMs: env.simulation.tickIntervalMs,
        },
        zones: ZONE_META.map((zone) => ({
          id: zone.id,
          label: zone.label,
          description: zone.description,
        })),
        agents: worldAgents,
        leaderboard: leaderboard.slice(0, 10),
        activeRoundtable: activeRoundtable ? buildRoundtableSummary(activeRoundtable) : null,
        recentEvents: events.map(toWorldEventView),
        externalSignals: buildWorldExternalSignalsView({
          primaryHotTopic: runtimeHotSignals.primaryHotTopic,
          candidateHotTopics: runtimeHotSignals.candidateHotTopics,
          hotTopics: signals.hotTopics.items,
          circles: signals.circles.items,
          trustedResults: signals.trusted?.items || [],
          mascot: signals.mascot.items,
        }),
        zhihu: zhihu.map<ZhihuStatusView>((item) => ({
          id: item.id,
          label: item.label,
          state: item.state,
          description: item.description || '待接入官方接口。',
          worldRole: item.worldRole || '待定义',
          expectedData: item.expectedData || '待提供',
          integrationHint: item.integrationHint || '待提供接口文档后完成接线',
        })),
        pulse: buildSocietyPulse({
          agents: worldAgents,
          events,
          allianceEdges,
          activeRoundtableTopic: activeRoundtable?.topic || null,
        }),
        economy,
        map: {
          width: WORLD_MAP_WIDTH,
          height: WORLD_MAP_HEIGHT,
          chunkSize: WORLD_CHUNK_SIZE,
          workPoints: WORLD_WORK_POINTS.map((point) => ({
            id: point.id,
            districtId: point.districtId,
            label: point.label,
            kind: point.kind,
            x: point.x,
            y: point.y,
          })),
          districts: WORLD_DISTRICTS,
        },
      } satisfies WorldStateView
    },
    {
      forceFresh: options.forceFresh,
    }
  )
}

export async function getLeaderboardView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'leaderboard',
    async () => {
      await ensureWorldInitialized()
      return buildLeaderboard()
    },
    {
      forceFresh: options.forceFresh,
    }
  )
}

export async function getAgentsDirectoryView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'agents-directory',
    async () => {
      await ensureWorldInitialized()

      const [agents, leaderboard] = await Promise.all([
        listWorldAgents(),
        getLeaderboardView({ forceFresh: options.forceFresh }),
      ])

      return {
        agents: agents.map(buildWorldAgentView),
        leaderboard,
        zones: ZONE_META.map((zone) => ({
          id: zone.id,
          label: zone.label,
          description: zone.description,
        })),
      } satisfies Pick<WorldStateView, 'agents' | 'leaderboard' | 'zones'>
    },
    {
      forceFresh: options.forceFresh,
      ttlMs: 20_000,
    }
  )
}

export async function getAgentDetailView(agentId: string, options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    `agent:${agentId}`,
    async () => {
      await ensureWorldInitialized()

      const [
        agent,
        leaderboard,
        relationships,
        events,
        roundtableTurns,
        roundtableParticipations,
        allAgents,
        allRelationships,
        economyEvents,
      ] =
        await Promise.all([
          prisma.agent.findUnique({
            where: { id: agentId },
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              zonePresence: true,
              user: true,
            },
          }),
          buildLeaderboard(),
          prisma.relationship.findMany({
            where: {
              OR: [{ sourceAgentId: agentId }, { targetAgentId: agentId }],
            },
            include: {
              sourceAgent: true,
              targetAgent: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 12,
          }),
          prisma.socialEvent.findMany({
            where: {
              OR: [{ actorAgentId: agentId }, { targetAgentId: agentId }],
            },
            include: {
              actorAgent: true,
              targetAgent: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          prisma.roundtableTurn.findMany({
            where: {
              speakerAgentId: agentId,
            },
            include: {
              roundtable: true,
              speakerAgent: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 6,
          }),
          prisma.roundtableParticipant.findMany({
            where: {
              agentId,
            },
            include: {
              roundtable: true,
            },
            orderBy: { joinedAt: 'desc' },
            take: 4,
          }),
          listAgents(),
          prisma.relationship.findMany(),
          prisma.socialEvent.findMany({
            orderBy: { createdAt: 'asc' },
          }),
        ])

      if (!agent) {
        return null
      }

      const snapshot = getLatestSnapshot(agent)
      const agentView = buildWorldAgentView(agent)
      const latestScore = leaderboard.find((item) => item.agentId === agent.id) || null
      const economyState = buildEconomyOverview({
        agents: allAgents.map(buildWorldAgentView),
        events: economyEvents,
        relationships: allRelationships.map((relationship) => ({
          sourceAgentId: relationship.sourceAgentId,
          targetAgentId: relationship.targetAgentId,
          type: relationship.type,
          strength: relationship.strength,
        })),
      })
      const economy =
        economyState.agentEconomy.get(agent.id) || {
          totalInventoryUnits: 0,
          consumptionUnits: 0,
          investmentUnits: 0,
          supportBalance: 0,
          stewardshipLabel: '勉强平衡',
          dominantResource: '待积累',
          resources: [],
          allianceDividend: {
            receivedUnits: 0,
            sharedUnits: 0,
            activePartners: 0,
            topPartner: null,
          },
        }
      const societyStats = buildAgentSocietyStats({
        agentId,
        events: [
          ...events.map((event) => ({
            type: event.type,
            actorAgentId: event.actorAgentId,
            targetAgentId: event.targetAgentId,
            topic: event.topic,
            metadata: event.metadata,
          })),
          ...roundtableTurns.map((turn) => ({
            type: 'roundtable_turn',
            actorAgentId: turn.speakerAgentId,
            targetAgentId: null,
            topic: turn.roundtable.topic,
            metadata: null,
          })),
          ...roundtableParticipations.map((participant) => ({
            type: 'roundtable_joined',
            actorAgentId: participant.agentId,
            targetAgentId: null,
            topic: participant.roundtable.topic,
            metadata: null,
          })),
        ],
        relationships: relationships.map((relationship) => ({
          type: relationship.type,
          strength: relationship.strength,
          sourceAgentId: relationship.sourceAgentId,
          targetAgentId: relationship.targetAgentId,
        })),
      })
      const combinedEvents = [
        ...events.map(toWorldEventView),
        ...roundtableTurns.map((turn) => ({
          id: `turn:${turn.id}`,
          type: 'roundtable_turn',
          topic: turn.roundtable.topic,
          summary: `在圆桌《${turn.roundtable.topic}》中发言：${turn.content}`,
          createdAt: turn.createdAt,
          actorId: turn.speakerAgentId || undefined,
          actorName: turn.speakerAgent?.displayName || agent.displayName,
          zone: 'roundtable' as ZoneType,
          metadata: null,
        })),
        ...roundtableParticipations.map((participant) => ({
          id: `participant:${participant.id}`,
          type: 'roundtable_joined',
          topic: participant.roundtable.topic,
          summary: `加入圆桌《${participant.roundtable.topic}》，身份为 ${participant.role || 'guest'}。`,
          createdAt: participant.joinedAt,
          actorId: participant.agentId,
          actorName: agent.displayName,
          zone: 'roundtable' as ZoneType,
          metadata: null,
        })),
      ]
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )
        .slice(0, 10)

      if (!combinedEvents.length) {
        combinedEvents.push({
          id: `presence:${agent.id}`,
          type: 'presence',
          topic: null,
          summary: `${agent.displayName} 当前在 ${agent.zonePresence?.zone || agent.currentZone}，等待下一轮社会互动。`,
          createdAt: agent.zonePresence?.updatedAt || agent.updatedAt,
          actorId: agent.id,
          actorName: agent.displayName,
          zone: agent.zonePresence?.zone || agent.currentZone,
          metadata: null,
        })
      }

      const relationshipSignals = summarizeRelationshipSignals(agentId, relationships)
      const persona = buildAgentPersonaView({
        agent: agentView,
        societyStats,
        relationshipSignals,
        roundtableTurns: roundtableTurns.length,
        roundtableParticipations: roundtableParticipations.length,
      })
      const behaviorInsights = buildAgentBehaviorInsights({
        agent: agentView,
        societyStats,
        relationshipSignals,
        recentEvents: combinedEvents,
        roundtableTurns: roundtableTurns.length,
        roundtableParticipations: roundtableParticipations.length,
      })
      const guidance = buildAgentGuidance({
        agent: agentView,
        latestScore,
        relationshipSignals,
      })

      return {
        agent: {
          ...agentView,
          bio: agent.bio,
          slug: agent.slug,
          isPlayable: agent.isPlayable,
          snapshot: snapshot
            ? {
                identity: toRecord(snapshot.identity),
                interests: toRecord(snapshot.interests),
                memory: toRecord(snapshot.memory),
                behavior: toRecord(snapshot.behavior),
                extractedTags: toRecord(snapshot.extractedTags),
              }
            : null,
        },
        latestScore,
        societyStats,
        economy,
        persona,
        behaviorInsights,
        guidance,
        relationships: relationships.map((relationship) => ({
          id: relationship.id,
          type: relationship.type,
          strength: relationship.strength,
          sourceName: relationship.sourceAgent.displayName,
          targetName: relationship.targetAgent.displayName,
        })),
        recentEvents: combinedEvents,
      } satisfies AgentDetailView
    },
    {
      forceFresh: options.forceFresh,
    }
  )
}

export async function getRoundtableListView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'roundtables',
    async () => {
      await ensureWorldInitialized()

      const roundtables = await prisma.roundtable.findMany({
        include: {
          hostAgent: true,
          participants: {
            include: {
              agent: true,
            },
          },
          turns: {
            include: {
              speakerAgent: true,
            },
            orderBy: { turnIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      })

      return roundtables.map(buildRoundtableSummary)
    },
    {
      forceFresh: options.forceFresh,
    }
  )
}

export async function getRoundtableDetailView(roundtableId: string, options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    `roundtable:${roundtableId}`,
    async () => {
      await ensureWorldInitialized()

      const [roundtable, relationshipEvents] = await Promise.all([
        prisma.roundtable.findUnique({
          where: { id: roundtableId },
          include: {
            hostAgent: {
              include: {
                snapshots: {
                  select: {
                    behavior: true,
                    extractedTags: true,
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
            participants: {
              include: {
                agent: {
                  include: {
                    snapshots: {
                      select: {
                        behavior: true,
                        extractedTags: true,
                      },
                      orderBy: { createdAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
            turns: {
              include: {
                speakerAgent: true,
              },
              orderBy: { turnIndex: 'asc' },
            },
          },
        }),
        prisma.socialEvent.findMany({
          where: {
            roundtableId,
            type: {
              in: ['follow', 'trust', 'cooperate', 'alliance', 'reject'],
            },
          },
          include: {
            actorAgent: {
              select: {
                displayName: true,
              },
            },
            targetAgent: {
              select: {
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      return roundtable ? buildRoundtableDetailView(roundtable, relationshipEvents) : null
    },
    {
      forceFresh: options.forceFresh,
    }
  )
}

export async function getGraphView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'graph',
    async () => {
      await ensureWorldInitialized()

      const neo4jGraph = await getNeo4jGraphView()
      if (neo4jGraph.graph) {
        return neo4jGraph.graph
      }

      const [nodes, edges] = await Promise.all([
        prisma.graphNode.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 28,
        }),
        prisma.graphEdge.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 42,
        }),
      ])

      return {
        nodes: nodes.map((node) => ({
          id: node.id,
          key: node.nodeKey,
          type: node.nodeType,
          label: node.label,
          size: node.nodeType === 'agent' ? 18 : node.nodeType === 'topic' ? 15 : 12,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          type: edge.edgeType,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          weight: edge.weight,
        })),
        meta: {
          backend: 'mysql',
          neo4jStatus: neo4jGraph.status,
          reason: neo4jGraph.reason || null,
        },
      } satisfies GraphView
    },
    {
      forceFresh: options.forceFresh,
      ttlMs: 6_000,
    }
  )
}

export async function getSessionView(user: (User & { agent?: Agent | null }) | null) {
  if (!user) {
    return null
  }

  const agent = user.agent
  return {
    user: {
      id: user.id,
      secondMeId: user.secondMeId,
      name: user.name,
      avatar: user.avatar,
      email: user.email,
    },
    agent: agent
      ? {
          id: agent.id,
          name: agent.displayName,
          slug: agent.slug,
          status: agent.status,
          zone: agent.currentZone,
          pixelRole: agent.pixelRole,
          pixelPalette: agent.pixelPalette,
        }
      : null,
  }
}
