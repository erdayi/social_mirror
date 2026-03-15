import type {
  Agent,
  AgentBehaviorStyle,
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
import { prisma } from '@/lib/prisma'
import {
  deriveBehaviorStyleFromShades,
  deriveStanceFromMemory,
  fetchSecondMeProfile,
  fetchSecondMeShades,
  fetchSecondMeSoftMemory,
  getValidAccessToken,
  streamSecondMeAct,
  streamSecondMeChat,
  type SecondMeMemory,
  type SecondMeProfile,
  type SecondMeShade,
} from '@/lib/secondme'
import { ensureZhihuCapabilities, listZhihuCapabilities } from '@/lib/zhihu'
import { getPortraitForAgent } from '@/lib/mesociety/assets'
import { deriveAvatarProfile } from '@/lib/mesociety/avatar'
import { seedAgentDefinitions } from '@/lib/mesociety/seeds'
import { calculateSScore } from '@/lib/mesociety/score'
import type {
  AgentDetailView,
  HomeWorldView,
  AgentWithSnapshot,
  GraphView,
  LeaderboardEntry,
  RoundtableSummary,
  WorldAgentView,
  WorldStateView,
  ZhihuStatusView,
} from '@/lib/mesociety/types'

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

type ViewReadOptions = {
  allowTick?: boolean
  forceFresh?: boolean
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
    Pick<RoundtableTurn, 'id' | 'stage' | 'speakerAgentId' | 'metadata' | 'content' | 'createdAt'> & {
      speakerAgent: Pick<Agent, 'displayName'> | null
    }
  >
}

type WorldEventRecord = Pick<
  SocialEvent,
  'id' | 'type' | 'topic' | 'summary' | 'createdAt' | 'actorAgentId' | 'targetAgentId' | 'zone'
> & {
  actorAgent: Pick<Agent, 'displayName'> | null
  targetAgent: Pick<Agent, 'displayName'> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mesocietyViewCache: Map<string, ViewCacheEntry> | undefined
}

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

function toRecord(value: Prisma.JsonValue | null | undefined) {
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

function getLatestSnapshot(agent: AgentWithSnapshot) {
  return agent.snapshots[0] || null
}

function getSnapshotTags(agent: AgentWithSnapshot) {
  const snapshot = getLatestSnapshot(agent)
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.extractedTags).tags)
}

function getSnapshotMemories(agent: AgentWithSnapshot) {
  const snapshot = getLatestSnapshot(agent)
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.memory).highlights)
}

function buildWorldAgentView(agent: WorldAgentRecord): WorldAgentView {
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
  }
}

function buildSnapshotPayload(input: {
  profile: SecondMeProfile | { userId: string; name: string; bio?: string }
  shades: SecondMeShade[]
  memories: SecondMeMemory[]
  style: AgentBehaviorStyle
  stance: AgentStance
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
    },
    extractedTags: {
      tags: Array.from(new Set(tags)).slice(0, 8),
    },
  }
}

function getZoneMeta(zone: ZoneType) {
  return ZONE_META.find((item) => item.id === zone) || ZONE_META[0]
}

function getZonePoint(zone: ZoneType, agentId: string, tickNumber: number) {
  const base = getZoneMeta(zone).anchor
  const spreadX = Math.floor(seededFloat(`${agentId}:${zone}:${tickNumber}:x`) * 14) - 7
  const spreadY = Math.floor(seededFloat(`${agentId}:${zone}:${tickNumber}:y`) * 12) - 6
  return {
    x: base.x + spreadX,
    y: base.y + spreadY,
  }
}

function decideZoneForAgent(input: {
  agent: AgentWithSnapshot
  tickNumber: number
  activeRoundtableId?: string | null
  participantAgentIds: Set<string>
}) {
  if (input.activeRoundtableId && input.participantAgentIds.has(input.agent.id)) {
    return 'roundtable' as ZoneType
  }

  const zoneCycle: ZoneType[] = ['plaza', 'discussion', 'leaderboard', 'plaza']
  const keyedIndex =
    Math.floor(seededFloat(`${input.agent.slug}:${input.tickNumber}`) * zoneCycle.length) %
    zoneCycle.length

  return zoneCycle[keyedIndex]
}

function compatibilityScore(source: AgentWithSnapshot, target: AgentWithSnapshot) {
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

function fallbackRoundtableMessage(agent: AgentWithSnapshot, topic: string, stage: RoundtableStatus) {
  const interests = getSnapshotTags(agent).slice(0, 3).join('、') || '社会关系'
  const memories = getSnapshotMemories(agent).slice(0, 2).join('；')

  if (stage === 'opening') {
    return `${agent.displayName} 认为「${topic}」最值得讨论的切口是 ${interests}。${memories ? `TA 想起：${memories}` : ''}`
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

    if (result.content) {
      return {
        content: result.content,
        origin: 'secondme' as const,
        degraded: false,
      }
    }

    return {
      content: fallbackRoundtableMessage(agent, topic, stage),
      origin: 'fallback' as const,
      degraded: false,
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
  const avatar = deriveAvatarProfile({
    interests: definition.interests,
    style: definition.style,
    stance: definition.stance,
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

    const point = getZonePoint('plaza', agent.id, 0)
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
    const point = getZonePoint(agent.currentZone, agent.id, 0)
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
  })
  const snapshot = buildSnapshotPayload({
    profile,
    shades,
    memories,
    style,
    stance,
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

  const point = getZonePoint('plaza', agent.id, 0)
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
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function listHomeAgents() {
  return prisma.agent.findMany({
    select: {
      id: true,
      displayName: true,
      source: true,
      status: true,
      pixelRole: true,
      pixelPalette: true,
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

async function getActiveRoundtableForHome() {
  return prisma.roundtable.findFirst({
    where: {
      status: {
        not: 'completed',
      },
    },
    select: {
      id: true,
      hostAgentId: true,
      topic: true,
      turns: {
        select: {
          id: true,
          content: true,
          speakerAgent: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: { turnIndex: 'desc' },
        take: 2,
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function listRecentWorldEvents() {
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

async function listHomeEvents() {
  return prisma.socialEvent.findMany({
    select: {
      id: true,
      type: true,
      summary: true,
      actorAgent: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
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
  return prisma.socialEvent.create({
    data,
  })
}

async function upsertRelationship(input: {
  type: RelationshipType
  sourceAgentId: string
  targetAgentId: string
  strength: number
  rationale: string
  topic: string
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
    zone: 'roundtable',
    topic: input.topic,
    summary: input.rationale,
  })
}

async function createRoundtable(agents: AgentWithSnapshot[], tickNumber: number) {
  if (agents.length < 3) {
    return null
  }

  const host =
    agents[Math.floor(seededFloat(`host:${tickNumber}`) * agents.length) % agents.length]
  const hostTags = getSnapshotTags(host)
  const topic =
    hostTags[0] || pickDeterministic(fallbackTopics, `${host.slug}:${tickNumber}:topic`)

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
    const openingTurns = []
    for (const agent of participants) {
      const message = await generateRoundtableMessage(agent, roundtable.topic, 'opening')
      openingTurns.push(
        await prisma.roundtableTurn.create({
          data: {
            roundtableId: roundtable.id,
            turnIndex: roundtable.turns.length + openingTurns.length,
            stage: 'opening',
            speakerAgentId: agent.id,
            content: message.content,
            metadata: {
              origin: message.origin,
              degraded: message.degraded,
              source: agent.source,
              stance: agent.stance,
              style: agent.style,
            },
          },
        })
      )
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
    const responseTurns = []
    for (const agent of participants) {
      const message = await generateRoundtableMessage(agent, roundtable.topic, 'responses')
      responseTurns.push(
        await prisma.roundtableTurn.create({
          data: {
            roundtableId: roundtable.id,
            turnIndex: roundtable.turns.length + responseTurns.length,
            stage: 'responses',
            speakerAgentId: agent.id,
            content: message.content,
            metadata: {
              origin: message.origin,
              degraded: message.degraded,
              source: agent.source,
              stance: agent.stance,
              style: agent.style,
            },
          },
        })
      )
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

      const record = contributionStats.get(turn.speakerAgentId) || {
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

      contributionStats.set(turn.speakerAgentId, record)
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
    prisma.agent.findMany(),
    prisma.relationship.findMany(),
    prisma.socialEvent.findMany(),
    prisma.roundtableParticipant.findMany(),
  ])

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

      const score = calculateSScore({
        followCount,
        interactionCount: agentEvents.length,
        roundtableCount: agentParticipants.length,
        trustWeight,
        allianceWeight,
        cooperationWeight,
        contributionScore,
        zoneDiversity,
        complianceScore,
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
  const [agents, relationships, roundtables] = await Promise.all([
    prisma.agent.findMany(),
    prisma.relationship.findMany(),
    prisma.roundtable.findMany({
      include: {
        participants: true,
      },
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
    const node = await ensureGraphNode(`agent:${agent.id}`, {
      type: 'agent',
      label: agent.displayName,
      refId: agent.id,
      metadata: {
        source: agent.source,
        stance: agent.stance,
      },
    })
    nodeMap.set(node.nodeKey, node.id)
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
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]))
  let roundtable = await getActiveRoundtable()

  if (!roundtable && agents.length >= 3 && tickNumber % 2 === 1) {
    roundtable = await createRoundtable(agents, tickNumber)
  } else if (roundtable) {
    await advanceRoundtable(roundtable, agentMap)
    roundtable = await getActiveRoundtable()
  }

  const participantIds = new Set(roundtable?.participants.map((item) => item.agentId) || [])

  for (const agent of agents) {
    const zone = decideZoneForAgent({
      agent,
      tickNumber,
      activeRoundtableId: roundtable?.id,
      participantAgentIds: participantIds,
    })

    const point = getZonePoint(zone, agent.id, tickNumber)
    const previousZone = agent.zonePresence?.zone || agent.currentZone

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
        summary: `${agent.displayName} 从 ${getZoneMeta(previousZone).label} 移动到了 ${getZoneMeta(zone).label}。`,
      })
    }

    if (zone === 'leaderboard' && seededFloat(`${agent.id}:${tickNumber}:leaderboard`) > 0.55) {
      await createSocialEvent({
        type: 'inspect_leaderboard',
        actorAgentId: agent.id,
        zone,
        summary: `${agent.displayName} 停下来观察社会大榜的变化。`,
      })
    }

    if (zone === 'discussion' && seededFloat(`${agent.id}:${tickNumber}:discussion`) > 0.62) {
      const topic = pickDeterministic(fallbackTopics, `${agent.id}:${tickNumber}:topic`)
      await createSocialEvent({
        type: 'discuss_topic',
        actorAgentId: agent.id,
        zone,
        topic,
        summary: `${agent.displayName} 在讨论区抛出了关于「${topic}」的新问题。`,
      })
    }
  }

  if (tickNumber % 3 === 0) {
    await createSocialEvent({
      type: 'zhihu_pending',
      zone: 'discussion',
      summary: '知乎真实接口位已预留，当前仍处于待接入状态。',
    })
  }

  await recomputeScores(tickNumber)
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

async function buildHomeLeaderboard() {
  const leaderboard = await buildLeaderboard()
  return leaderboard.slice(0, 5).map((entry) => ({
    agentId: entry.agentId,
    name: entry.name,
    totalScore: entry.totalScore,
  }))
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
        createdAt: turn.createdAt.toISOString(),
      }
    }),
  }
}

export async function getWorldStateView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'world',
    async () => {
      await ensureWorldInitialized()

      const [worldState, agents, leaderboard, events, activeRoundtable, zhihu] = await Promise.all([
        prisma.worldState.findUnique({
          where: { id: WORLD_STATE_ID },
        }),
        listWorldAgents(),
        buildLeaderboard(),
        listRecentWorldEvents(),
        getActiveRoundtableForView(),
        listZhihuCapabilities(),
      ])

      const currentWorldState = worldState || (await ensureWorldState())

      return {
        tickCount: currentWorldState.tickCount,
        lastTickAt: currentWorldState.lastTickAt?.toISOString() || null,
        intervals: {
          tickMs: env.simulation.tickIntervalMs,
        },
        zones: ZONE_META.map((zone) => ({
          id: zone.id,
          label: zone.label,
          description: zone.description,
        })),
        agents: agents.map(buildWorldAgentView),
        leaderboard: leaderboard.slice(0, 10),
        activeRoundtable: activeRoundtable ? buildRoundtableSummary(activeRoundtable) : null,
        recentEvents: events.map((event) => ({
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
        })),
        zhihu: zhihu.map<ZhihuStatusView>((item) => ({
          id: item.id,
          label: item.label,
          state: item.state,
          description: item.description || '待接入官方接口。',
        })),
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

export async function getHomeWorldView(options: ViewReadOptions = {}) {
  if (options.allowTick) {
    await maybeRunSimulationTick()
  }

  return readCachedView(
    'home',
    async () => {
      await ensureWorldInitialized()

      const [worldState, agents, leaderboard, events, activeRoundtable] = await Promise.all([
        prisma.worldState.findUnique({
          where: { id: WORLD_STATE_ID },
          select: {
            tickCount: true,
          },
        }),
        listHomeAgents(),
        buildHomeLeaderboard(),
        listHomeEvents(),
        getActiveRoundtableForHome(),
      ])

      const currentWorldState = worldState || (await ensureWorldState())

      return {
        tickCount: currentWorldState.tickCount,
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.displayName,
          source: agent.source,
          status: agent.status,
          pixelRole: agent.pixelRole,
          pixelPalette: agent.pixelPalette,
        })),
        leaderboard,
        activeRoundtable: activeRoundtable
          ? {
              id: activeRoundtable.id,
              hostId: activeRoundtable.hostAgentId,
              topic: activeRoundtable.topic,
              turns: activeRoundtable.turns
                .slice()
                .reverse()
                .map((turn) => ({
                  id: turn.id,
                  speakerName: turn.speakerAgent?.displayName || null,
                  content: turn.content,
                })),
            }
          : null,
        recentEvents: events.map((event) => ({
          id: event.id,
          type: event.type,
          actorName: event.actorAgent?.displayName,
          summary: event.summary,
        })),
      } satisfies HomeWorldView
    },
    {
      forceFresh: options.forceFresh,
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

      const [agent, leaderboard, relationships, events] = await Promise.all([
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
      ])

      if (!agent) {
        return null
      }

      const snapshot = getLatestSnapshot(agent)
      const latestScore = leaderboard.find((item) => item.agentId === agent.id) || null

      return {
        agent: {
          ...buildWorldAgentView(agent),
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
        relationships: relationships.map((relationship) => ({
          id: relationship.id,
          type: relationship.type,
          strength: relationship.strength,
          sourceName: relationship.sourceAgent.displayName,
          targetName: relationship.targetAgent.displayName,
        })),
        recentEvents: events.map((event) => ({
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
        })),
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

      const roundtable = await prisma.roundtable.findUnique({
        where: { id: roundtableId },
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
      })

      return roundtable ? buildRoundtableSummary(roundtable) : null
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
