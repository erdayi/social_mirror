import fs from 'node:fs/promises'
import path from 'node:path'
import { env, hasZhihuCredentials } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import {
  createZhihuComment,
  deleteZhihuComment,
  fetchZhihuHotTopics,
  fetchZhihuRingDetail,
  fetchZhihuTrustedSearch,
  publishZhihuRingPost,
  reactZhihuContent,
} from '@/lib/adapters/zhihu'

type IntegrationState = 'pending_integration' | 'connected' | 'error'

export type ZhihuCircleRecord = {
  id: string
  title: string
  tags: string[]
  memberCount: number
  activityScore: number
  description?: string
  contentPreview?: string
  contentToken?: string | null
  authorName?: string | null
  commentCount?: number
  likeCount?: number
  topCommentId?: string | null
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
  assetPath: string | null
  available: boolean
  note?: string | null
}

type PendingResponse<T> = {
  state: IntegrationState
  capabilities: Awaited<ReturnType<typeof listZhihuCapabilities>>
  items: T[]
  message?: string
  meta?: Record<string, unknown>
}

type ZhihuCapabilitySeed = {
  id: 'circles' | 'hot' | 'trusted_search' | 'mascot_assets'
  label: string
  description: string
  worldRole: string
  expectedData: string
  integrationHint: string
}

type MascotCache = {
  expiresAt: number
  items: ZhihuMascotRecord[]
}

const zhihuCapabilities: ZhihuCapabilitySeed[] = [
  {
    id: 'circles',
    label: '知乎圈子',
    description: '接入真实圈子数据，作为 Agent 的真实社区结构与内容源。',
    worldRole: '真实社区结构入口，驱动 Agent 的圈层归属、圈内互动与部落式社交。',
    expectedData: '圈子列表、成员规模、圈内热门话题、声望/互动记录。',
    integrationHint: '圈子内容会直接映射到 Agent 的“社区场景”与“圈层互动”规则。',
  },
  {
    id: 'hot',
    label: '知乎热榜',
    description: '接入真实热榜话题，作为世界外部事件源。',
    worldRole: '事件驱动入口，驱动 Agent 对中文互联网真实议题的响应、辩论与结盟。',
    expectedData: '热榜话题、热度分值、话题详情、参与链接。',
    integrationHint: '热榜会直接替换内部热点种子，成为世界规则的外部事件源。',
  },
  {
    id: 'trusted_search',
    label: '知乎可信搜',
    description: '接入真实可信搜结果，作为 Agent 的证据引用与观点验证来源。',
    worldRole: '证据检索入口，驱动 Agent 的事实校验、引用能力与信任决策。',
    expectedData: '搜索结果、可信摘要、来源列表、可信度评分。',
    integrationHint: '可信搜结果会进入信任度结算和辩论胜率判断，不需要重构世界层。',
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

let mascotCache: MascotCache | null = null

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

async function setCapabilityState(
  id: ZhihuCapabilitySeed['id'],
  state: 'pending_integration' | 'connected' | 'error',
  description?: string
) {
  await prisma.zhihuIntegrationStatus.update({
    where: { id },
    data: {
      state,
      ...(description ? { description } : {}),
    },
  })
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
        assetPath: typeof record.assetPath === 'string' ? record.assetPath : null,
        available: record.available === true,
        note: typeof record.note === 'string' ? record.note : null,
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
    message: 'Zhihu credentials are not configured.',
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function inferMascotAssetType(name: string): ZhihuMascotRecord['assetType'] {
  if (name.includes('四视图') || name.includes('基础造型')) {
    return 'guide'
  }

  if (name.includes('围脖') || name.includes('3d')) {
    return 'scene'
  }

  if (name.includes('广播') || name.includes('播报')) {
    return 'broadcast'
  }

  return 'badge'
}

async function readMascotPackage() {
  if (mascotCache && mascotCache.expiresAt > Date.now()) {
    return mascotCache.items
  }

  const root = path.join(process.cwd(), '刘看山3d+平面')
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    const items = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .slice(0, 24)
      .map((fileName, index) => {
        const cleanedName = fileName.replace(/^\._/, '')
        const isRenderable =
          /\.(png|jpg|jpeg|webp|svg)$/i.test(cleanedName) && !fileName.startsWith('._')
        return {
          id: `mascot_${index}`,
          name: cleanedName,
          role: index === 0 ? '社区向导' : '世界播报资源',
          assetType: inferMascotAssetType(cleanedName),
          assetPath: isRenderable ? path.join(root, fileName) : null,
          available: isRenderable,
          note: isRenderable ? null : '当前检测到的是资源包索引文件，尚未发现可直接渲染的导出图。',
        } satisfies ZhihuMascotRecord
      })

    mascotCache = {
      expiresAt: Date.now() + 60_000,
      items,
    }
    return items
  } catch {
    return []
  }
}

export async function listCircles(options: {
  ringIds?: string[]
  pageNum?: number
  pageSize?: number
} = {}) {
  await ensureZhihuCapabilities()

  if (!hasZhihuCredentials()) {
    return buildPendingResponse<ZhihuCircleRecord>('circles')
  }

  try {
    const ringIds = (options.ringIds?.length ? options.ringIds : env.zhihu.ringIds).slice(0, 4)
    const items = await Promise.all(
      ringIds.map(async (ringId) => {
        const ring = await fetchZhihuRingDetail({
          ringId,
          pageNum: options.pageNum || 1,
          pageSize: options.pageSize || 10,
        })
        return {
          id: ring.ring_info?.ring_id || ringId,
          title: ring.ring_info?.ring_name || `圈子 ${ringId}`,
          tags:
            ring.contents?.flatMap((content) =>
              Array.from(stripHtml(content.content || '').matchAll(/#([^#\s]+)/g)).map((match) => match[1])
            ).slice(0, 6) || [],
          memberCount: ring.ring_info?.membership_num || 0,
          activityScore: ring.ring_info?.discussion_num || 0,
          description: stripHtml(ring.ring_info?.ring_desc || '').slice(0, 180),
          contentPreview: stripHtml(ring.contents?.[0]?.content || '').slice(0, 180),
          contentToken:
            String(ring.contents?.[0]?.pin_id || '').trim() || null,
          authorName: ring.contents?.[0]?.author_name || null,
          commentCount: ring.contents?.[0]?.comment_num || 0,
          likeCount: ring.contents?.[0]?.like_num || 0,
          topCommentId:
            String(ring.contents?.[0]?.comments?.[0]?.comment_id || '').trim() || null,
        } satisfies ZhihuCircleRecord
      })
    )

    await setCapabilityState('circles', 'connected', '已接入真实知乎圈子数据。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'connected' as const,
      capabilities: capabilities.filter((item) => item.id === 'circles'),
      items,
      meta: {
        ringIds,
      },
    }
  } catch (error) {
    await setCapabilityState('circles', 'error', '知乎圈子数据读取失败，当前已降级。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'error' as const,
      capabilities: capabilities.filter((item) => item.id === 'circles'),
      items: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function listHotTopics(options: {
  topCnt?: number
  publishInHours?: number
} = {}) {
  await ensureZhihuCapabilities()

  if (!hasZhihuCredentials()) {
    return buildPendingResponse<ZhihuHotTopicRecord>('hot')
  }

  try {
    const data = await fetchZhihuHotTopics(options)
    const items =
      data.list?.map((topic, index) => ({
        id: topic.token || `hot_${index}`,
        title: topic.title || '未命名热榜话题',
        excerpt: stripHtml(topic.body || '').slice(0, 180),
        heat: topic.heat_score || 0,
        url: topic.link_url,
      })) || []

    await setCapabilityState('hot', 'connected', '已接入真实知乎热榜数据。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'connected' as const,
      capabilities: capabilities.filter((item) => item.id === 'hot'),
      items,
      meta: {
        total: items.length,
      },
    }
  } catch (error) {
    await setCapabilityState('hot', 'error', '知乎热榜读取失败，当前已降级。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'error' as const,
      capabilities: capabilities.filter((item) => item.id === 'hot'),
      items: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function searchTrustedContent(query = '', count = 5) {
  await ensureZhihuCapabilities()

  if (!hasZhihuCredentials()) {
    return buildPendingResponse<ZhihuTrustedSearchRecord>('trusted_search')
  }

  if (!query.trim()) {
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'connected' as const,
      capabilities: capabilities.filter((item) => item.id === 'trusted_search'),
      items: [],
      message: 'Query is empty.',
    }
  }

  try {
    const data = await fetchZhihuTrustedSearch({
      query,
      count,
    })

    const items =
      data.items?.map((item, index) => ({
        id: item.content_id || `trusted_${index}`,
        query,
        summary:
          stripHtml(item.content_text || item.comment_info_list?.[0]?.content || '').slice(0, 180) ||
          item.title ||
          '暂无摘要',
        confidence: Number(item.authority_level || '0'),
        sources: [
          {
            title: item.title || item.author_name || '知乎内容',
            url: item.url,
          },
        ],
      })) || []

    await setCapabilityState('trusted_search', 'connected', '已接入真实知乎可信搜数据。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'connected' as const,
      capabilities: capabilities.filter((item) => item.id === 'trusted_search'),
      items,
      meta: {
        hasMore: Boolean(data.has_more),
      },
    }
  } catch (error) {
    await setCapabilityState('trusted_search', 'error', '知乎可信搜读取失败，当前已降级。')
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'error' as const,
      capabilities: capabilities.filter((item) => item.id === 'trusted_search'),
      items: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function publishControlledRingPost(input: {
  ringId: string
  title: string
  content: string
  imageUrls?: string[]
}) {
  await ensureZhihuCapabilities()

  if (!hasZhihuCredentials()) {
    return {
      state: 'pending_integration' as const,
      message: 'Zhihu credentials are not configured.',
    }
  }

  if (env.zhihu.publishMode !== 'autonomous' && !input.content.trim()) {
    return {
      state: 'error' as const,
      message: 'Content is required for controlled publish.',
    }
  }

  try {
    const result = await publishZhihuRingPost(input)
    await setCapabilityState('circles', 'connected', '已接入真实知乎圈子数据。')
    return {
      state: 'connected' as const,
      data: result,
      publishMode: env.zhihu.publishMode,
    }
  } catch (error) {
    await setCapabilityState('circles', 'error', '知乎圈子发布失败，当前已降级。')
    return {
      state: 'error' as const,
      message: error instanceof Error ? error.message : String(error),
      publishMode: env.zhihu.publishMode,
    }
  }
}

export async function getMascotAssets() {
  await ensureZhihuCapabilities()

  const items = await readMascotPackage()
  if (!items.length) {
    const capabilities = await listZhihuCapabilities()
    return {
      state: 'pending_integration' as const,
      capabilities: capabilities.filter((item) => item.id === 'mascot_assets'),
      items: [],
      message: '未发现刘看山资源包文件。',
    }
  }

  await setCapabilityState(
    'mascot_assets',
    'connected',
    items.some((item) => item.available)
      ? '已挂载刘看山资源包。'
      : '已识别刘看山资源包索引，但尚未发现可直接渲染的导出图。'
  )
  const capabilities = await listZhihuCapabilities()
  return {
    state: 'connected' as const,
    capabilities: capabilities.filter((item) => item.id === 'mascot_assets'),
    items,
    meta: {
      fileCount: items.length,
    },
  }
}

export async function getZhihuWorldSignals(topicHint?: string | null) {
  const [hotTopics, circles, trusted, mascot] = await Promise.all([
    listHotTopics({ topCnt: 6, publishInHours: 48 }),
    listCircles({ pageSize: 6 }),
    topicHint ? searchTrustedContent(topicHint, 4) : Promise.resolve(null),
    getMascotAssets(),
  ])

  return {
    hotTopics,
    circles,
    trusted,
    mascot,
  }
}

export async function reactToRingContent(input: {
  contentToken: string
  contentType: 'pin' | 'comment'
  actionValue: 0 | 1
}) {
  await ensureZhihuCapabilities()
  return reactZhihuContent(input)
}

export async function createRingComment(input: {
  contentToken: string
  contentType: 'pin' | 'comment'
  content: string
}) {
  await ensureZhihuCapabilities()
  return createZhihuComment(input)
}

export async function removeRingComment(input: { commentId: string }) {
  await ensureZhihuCapabilities()
  return deleteZhihuComment(input)
}
