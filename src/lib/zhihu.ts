import { prisma } from '@/lib/prisma'

type PendingState = 'pending_integration'

export type ZhihuCircleRecord = {
  id: string
  title: string
  tags: string[]
  memberCount: number
  activityScore: number
}

export type ZhihuHotTopicRecord = {
  id: string
  title: string
  excerpt: string
  heat: number
  url?: string
}

export type ZhihuTrustedSearchRecord = {
  id: string
  query: string
  summary: string
  confidence: number
  sources: Array<{
    title: string
    url?: string
  }>
}

export type ZhihuMascotRecord = {
  id: string
  name: string
  role: string
  assetType: 'guide' | 'broadcast' | 'badge' | 'scene'
}

type PendingResponse<T> = {
  state: PendingState
  capabilities: Awaited<ReturnType<typeof listZhihuCapabilities>>
  items: T[]
}

type ZhihuCapabilitySeed = {
  id: 'circles' | 'hot' | 'trusted_search' | 'mascot_assets'
  label: string
  description: string
  worldRole: string
  expectedData: string
  integrationHint: string
}

const zhihuCapabilities: ZhihuCapabilitySeed[] = [
  {
    id: 'circles',
    label: '知乎圈子',
    description: '待接入官方圈子接口后开放真实圈子浏览、加入与互动能力。',
    worldRole: '真实社区结构入口，驱动 Agent 的圈层归属、圈内互动与部落式社交。',
    expectedData: '圈子列表、成员规模、圈内热门话题、声望/互动记录。',
    integrationHint: '接入后可直接映射为 Agent 的“社区场景”和“圈子声望”结算维度。',
  },
  {
    id: 'hot',
    label: '知乎热榜',
    description: '待接入官方热榜接口后开放真实热点观察与讨论入口。',
    worldRole: '事件驱动入口，驱动 Agent 对中文互联网真实议题的响应、辩论与结盟。',
    expectedData: '热榜话题、热度分值、话题详情、参与链接。',
    integrationHint: '接入后会直接替换当前内部热议种子，成为世界规则的外部事件源。',
  },
  {
    id: 'trusted_search',
    label: '知乎可信搜',
    description: '待接入官方可信搜接口后开放观点验证与引用能力。',
    worldRole: '证据检索入口，驱动 Agent 的事实校验、引用能力与信任决策。',
    expectedData: '搜索结果、可信摘要、来源列表、可信度评分。',
    integrationHint: '接入后会进入信任度结算和辩论胜率判断，不需要重构世界层。',
  },
  {
    id: 'mascot_assets',
    label: '刘看山资源',
    description: '待接入官方形象授权与资源包后开放视觉联动能力。',
    worldRole: '社区向导与播报入口，驱动新手引导、世界播报和视觉识别。',
    expectedData: '角色素材、播报模板、品牌视觉规范。',
    integrationHint: '接入后会直接作为向导角色与广播 UI 资源使用，不影响主规则引擎。',
  },
] as const

export async function ensureZhihuCapabilities() {
  await Promise.all(
    zhihuCapabilities.map((item) =>
      prisma.zhihuIntegrationStatus.upsert({
        where: { id: item.id },
        update: {
          label: item.label,
          description: item.description,
        },
        create: {
          id: item.id,
          label: item.label,
          description: item.description,
        },
      })
    )
  )
}

export async function listZhihuCapabilities() {
  await ensureZhihuCapabilities()
  const statuses = await prisma.zhihuIntegrationStatus.findMany({
    orderBy: { id: 'asc' },
  })

  return statuses.map((status) => {
    const seed = zhihuCapabilities.find((item) => item.id === status.id)
    return {
      ...status,
      worldRole: seed?.worldRole || '待定义',
      expectedData: seed?.expectedData || '待补充',
      integrationHint: seed?.integrationHint || '待补充',
    }
  })
}

export function normalizeZhihuCirclePayload(payload: unknown): ZhihuCircleRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title : typeof record.name === 'string' ? record.name : null
    if (!title) {
      return []
    }

    return [
      {
        id: String(record.id || `circle_${index}`),
        title,
        tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        memberCount: typeof record.memberCount === 'number' ? record.memberCount : 0,
        activityScore: typeof record.activityScore === 'number' ? record.activityScore : 0,
      },
    ]
  })
}

export function normalizeZhihuHotPayload(payload: unknown): ZhihuHotTopicRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title : null
    if (!title) {
      return []
    }
    return [
      {
        id: String(record.id || `hot_${index}`),
        title,
        excerpt: typeof record.excerpt === 'string' ? record.excerpt : '',
        heat: typeof record.heat === 'number' ? record.heat : 0,
        url: typeof record.url === 'string' ? record.url : undefined,
      },
    ]
  })
}

export function normalizeZhihuTrustedSearchPayload(payload: unknown): ZhihuTrustedSearchRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    const query = typeof record.query === 'string' ? record.query : null
    if (!query) {
      return []
    }
    const sources = Array.isArray(record.sources)
      ? record.sources.flatMap((source) => {
          if (!source || typeof source !== 'object') {
            return []
          }
          const sourceRecord = source as Record<string, unknown>
          const title = typeof sourceRecord.title === 'string' ? sourceRecord.title : null
          if (!title) {
            return []
          }
          return [{ title, url: typeof sourceRecord.url === 'string' ? sourceRecord.url : undefined }]
        })
      : []

    return [
      {
        id: String(record.id || `trusted_${index}`),
        query,
        summary: typeof record.summary === 'string' ? record.summary : '',
        confidence: typeof record.confidence === 'number' ? record.confidence : 0,
        sources,
      },
    ]
  })
}

export function normalizeZhihuMascotPayload(payload: unknown): ZhihuMascotRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : null
    if (!name) {
      return []
    }
    const assetType =
      record.assetType === 'guide' ||
      record.assetType === 'broadcast' ||
      record.assetType === 'badge' ||
      record.assetType === 'scene'
        ? record.assetType
        : 'guide'

    return [
      {
        id: String(record.id || `mascot_${index}`),
        name,
        role: typeof record.role === 'string' ? record.role : '社区向导',
        assetType,
      },
    ]
  })
}

async function buildPendingResponse<T>(capabilityId: ZhihuCapabilitySeed['id']): Promise<PendingResponse<T>> {
  const statuses = await listZhihuCapabilities()
  return {
    state: 'pending_integration' as const,
    capabilities: statuses.filter((item) => item.id === capabilityId),
    items: [],
  }
}

export async function listCircles() {
  return buildPendingResponse<ZhihuCircleRecord>('circles')
}

export async function listHotTopics() {
  return buildPendingResponse<ZhihuHotTopicRecord>('hot')
}

export async function searchTrustedContent() {
  return buildPendingResponse<ZhihuTrustedSearchRecord>('trusted_search')
}

export async function getMascotAssets() {
  return buildPendingResponse<ZhihuMascotRecord>('mascot_assets')
}
