import crypto from 'node:crypto'
import { env, hasZhihuCredentials } from '@/lib/env'

type ZhihuEnvelope<T> = {
  status: number
  msg: string
  data: T | null
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  body?: Record<string, unknown>
  extraInfo?: string
  qps?: number
  cacheTtlMs?: number
}

type RingDetailData = {
  ring_info?: {
    ring_id?: string
    ring_name?: string
    ring_desc?: string
    ring_avatar?: string
    membership_num?: number
    discussion_num?: number
  }
  contents?: Array<{
    pin_id?: string | number
    content?: string
    author_name?: string
    images?: string[]
    publish_time?: number
    like_num?: number
    comment_num?: number
    share_num?: number
    fav_num?: number
    comments?: Array<{
      comment_id?: string | number
      content?: string
      author_name?: string
      author_token?: string
      like_count?: number
      reply_count?: number
      publish_time?: number
    }>
  }>
}

type BillboardListData = {
  list?: Array<{
    token?: string
    title?: string
    body?: string
    link_url?: string
    published_time?: number
    published_time_str?: string
    heat_score?: number
    type?: string
    answers?: Array<{
      token?: string
      title?: string
      body?: string
      link_url?: string
      published_time?: number
      published_time_str?: string
      heat_score?: number
      interaction_info?: {
        vote_up_count?: number
        like_count?: number
        comment_count?: number
        favorites?: number
        pv_count?: number
      }
    }>
    interaction_info?: {
      vote_up_count?: number
      like_count?: number
      comment_count?: number
      favorites?: number
      pv_count?: number
    }
  }>
}

type TrustedSearchData = {
  has_more?: boolean
  items?: Array<{
    title?: string
    content_type?: string
    content_id?: string
    content_text?: string
    url?: string
    comment_count?: number
    vote_up_count?: number
    author_name?: string
    author_avatar?: string
    authority_level?: string
    comment_info_list?: Array<{
      content?: string
    }>
  }>
}

type PublishPinData = {
  content_token?: string
}

type ReactionData = {
  success?: boolean
}

type CommentCreateData = {
  comment_id?: string | number
}

type CommentDeleteData = {
  success?: boolean
}

type CachedItem = {
  expiresAt: number
  value: unknown
}

const requestCache = new Map<string, CachedItem>()
let nextRequestAt = 0

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRateLimit(qps = 10) {
  const spacingMs = Math.ceil(1000 / Math.max(1, qps))
  const now = Date.now()
  const target = Math.max(now, nextRequestAt)
  nextRequestAt = target + spacingMs

  if (target > now) {
    await sleep(target - now)
  }
}

function buildQueryString(query: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue
    }
    searchParams.set(key, String(value))
  }
  const serialized = searchParams.toString()
  return serialized ? `?${serialized}` : ''
}

function buildSignature(timestamp: string, logId: string, extraInfo = '') {
  const signString = `app_key:${env.zhihu.appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`
  return crypto
    .createHmac('sha256', env.zhihu.appSecret)
    .update(signString)
    .digest('base64')
}

function buildHeaders(extraInfo = '') {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const logId = `zhihu_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  return {
    'X-App-Key': env.zhihu.appKey,
    'X-Timestamp': timestamp,
    'X-Log-Id': logId,
    'X-Sign': buildSignature(timestamp, logId, extraInfo),
    'X-Extra-Info': extraInfo,
  }
}

async function zhihuRequest<T>(path: string, options: RequestOptions = {}) {
  if (!hasZhihuCredentials()) {
    throw new Error('Zhihu credentials are not configured.')
  }

  const method = options.method || 'GET'
  const queryString = options.query ? buildQueryString(options.query) : ''
  const bodyString = options.body ? JSON.stringify(options.body) : ''
  const cacheKey = `${method}:${path}${queryString}:${bodyString}`
  const cached = requestCache.get(cacheKey)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.value as ZhihuEnvelope<T>
  }

  await waitForRateLimit(options.qps || 10)

  const response = await fetch(`${env.zhihu.apiBaseUrl}${path}${queryString}`, {
    method,
    headers: {
      ...buildHeaders(options.extraInfo || ''),
      ...(bodyString ? { 'Content-Type': 'application/json' } : {}),
    },
    body: bodyString || undefined,
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Zhihu API ${response.status}: ${text || response.statusText}`)
  }

  const payload = (await response.json()) as ZhihuEnvelope<T>
  requestCache.set(cacheKey, {
    expiresAt: now + (options.cacheTtlMs || 60_000),
    value: payload,
  })
  return payload
}

function requireSuccess<T>(payload: ZhihuEnvelope<T>) {
  if (payload.status !== 0 || !payload.data) {
    throw new Error(payload.msg || 'Zhihu API returned an unsuccessful response.')
  }

  return payload.data
}

export async function fetchZhihuRingDetail(input: {
  ringId: string
  pageNum?: number
  pageSize?: number
}) {
  const payload = await zhihuRequest<RingDetailData>('/openapi/ring/detail', {
    query: {
      ring_id: input.ringId,
      page_num: input.pageNum || 1,
      page_size: Math.min(input.pageSize || 20, 50),
    },
    cacheTtlMs: 45_000,
  })

  return requireSuccess(payload)
}

export async function fetchZhihuHotTopics(input: {
  topCnt?: number
  publishInHours?: number
}) {
  const payload = await zhihuRequest<BillboardListData>('/openapi/billboard/list', {
    query: {
      top_cnt: Math.min(input.topCnt || 20, 50),
      publish_in_hours: input.publishInHours || 48,
    },
    cacheTtlMs: 45_000,
  })

  return requireSuccess(payload)
}

export async function fetchZhihuTrustedSearch(input: {
  query: string
  count?: number
}) {
  const payload = await zhihuRequest<TrustedSearchData>('/openapi/search/global', {
    query: {
      query: input.query,
      count: Math.min(input.count || 5, 20),
    },
    qps: 1,
    cacheTtlMs: 30_000,
  })

  return requireSuccess(payload)
}

export async function publishZhihuRingPost(input: {
  ringId: string
  title: string
  content: string
  imageUrls?: string[]
}) {
  const payload = await zhihuRequest<PublishPinData>('/openapi/publish/pin', {
    method: 'POST',
    body: {
      ring_id: input.ringId,
      title: input.title,
      content: input.content,
      image_urls: input.imageUrls || [],
    },
    cacheTtlMs: 0,
  })

  return requireSuccess(payload)
}

export async function reactZhihuContent(input: {
  contentToken: string
  contentType: 'pin' | 'comment'
  actionValue: 0 | 1
}) {
  const payload = await zhihuRequest<ReactionData>('/openapi/reaction', {
    method: 'POST',
    body: {
      content_token: input.contentToken,
      content_type: input.contentType,
      action_type: 'like',
      action_value: input.actionValue,
    },
    cacheTtlMs: 0,
  })

  return requireSuccess(payload)
}

export async function createZhihuComment(input: {
  contentToken: string
  contentType: 'pin' | 'comment'
  content: string
}) {
  const payload = await zhihuRequest<CommentCreateData>('/openapi/comment/create', {
    method: 'POST',
    body: {
      content_token: input.contentToken,
      content_type: input.contentType,
      content: input.content,
    },
    cacheTtlMs: 0,
  })

  return requireSuccess(payload)
}

export async function deleteZhihuComment(input: { commentId: string }) {
  const payload = await zhihuRequest<CommentDeleteData>('/openapi/comment/delete', {
    method: 'POST',
    body: {
      comment_id: input.commentId,
    },
    cacheTtlMs: 0,
  })

  return requireSuccess(payload)
}
