import type { AgentBehaviorStyle, AgentStance, User } from '@prisma/client'
import { env, hasSecondMeCredentials } from '@/lib/env'
import { prisma } from '@/lib/prisma'

type WrappedResponse<T> = {
  code: number
  message?: string
  data?: T
}

type TokenPayload = {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  expiresIn: number
  scope?: string[]
}

export type SecondMeProfile = {
  userId: string
  name: string
  email?: string
  avatar?: string
  bio?: string
  selfIntroduction?: string
  route?: string
}

export type SecondMeShade = {
  shadeName: string
  confidenceLevel: string
  shadeDescription?: string
  sourceTopics?: string[]
}

export type SecondMeMemory = {
  id: number
  factObject: string
  factContent: string
  createTime?: number
  updateTime?: number
}

export type SecondMeTTSResult = {
  url: string
  durationMs: number
  sampleRate: number
  format: string
}

export type SecondMeSession = {
  sessionId: string
  appId: string
  lastMessage: string
  lastUpdateTime: string
  messageCount: number
}

export type SecondMeMessage = {
  messageId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  senderUserId: number | null
  receiverUserId: number | null
  createTime: string
}

export type SecondMeIngestEvent = {
  channel: {
    kind: string
    id?: string
    url?: string
    meta?: Record<string, unknown>
  }
  action: string
  refs: Array<{
    objectType: string
    objectId: string
    type?: string
    url?: string
    contentPreview?: string
    snapshot?: {
      text: string
      capturedAt?: number
      hash?: string
    }
  }>
  actionLabel?: string
  displayText?: string
  eventDesc?: string
  eventTime?: number
  importance?: number
  idempotencyKey?: string
  payload?: Record<string, unknown>
}

type TokenGrant = 'authorization_code' | 'refresh_token'

function assertSecondMeCredentials() {
  if (!hasSecondMeCredentials()) {
    throw new Error('SecondMe credentials are not configured.')
  }
}

async function readWrappedJson<T>(response: Response) {
  const result = (await response.json()) as WrappedResponse<T>

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(result.message || `SecondMe request failed with ${response.status}`)
  }

  return result.data
}

async function requestToken(input: {
  grantType: TokenGrant
  code?: string
  refreshToken?: string
}) {
  assertSecondMeCredentials()

  const endpoint =
    input.grantType === 'authorization_code'
      ? '/api/oauth/token/code'
      : '/api/oauth/token/refresh'

  const body = new URLSearchParams({
    grant_type: input.grantType,
    client_id: env.secondMe.clientId,
    client_secret: env.secondMe.clientSecret,
  })

  if (input.code) {
    body.set('code', input.code)
    body.set('redirect_uri', env.secondMe.redirectUri)
  }

  if (input.refreshToken) {
    body.set('refresh_token', input.refreshToken)
  }

  const response = await fetch(`${env.secondMe.apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  return readWrappedJson<TokenPayload>(response)
}

async function withAccessToken(
  accessToken: string,
  path: string,
  init?: RequestInit
) {
  const response = await fetch(`${env.secondMe.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  return response
}

function parseSseText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let currentEvent = 'data'
  let sessionId: string | null = null
  let content = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.replace('event:', '').trim()
      continue
    }

    if (!line.startsWith('data:')) {
      continue
    }

    const raw = line.replace('data:', '').trim()
    if (raw === '[DONE]') {
      continue
    }

    try {
      const parsed = JSON.parse(raw) as {
        sessionId?: string
        choices?: Array<{ delta?: { content?: string } }>
      }

      if (currentEvent === 'session' && parsed.sessionId) {
        sessionId = parsed.sessionId
      }

      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) {
        content += delta
      }
    } catch {
      content += raw
    }
  }

  return {
    sessionId,
    content: content.trim(),
  }
}

function extractJsonObject<T>(raw: string): T | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  try {
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

export function buildSecondMeAuthUrl() {
  assertSecondMeCredentials()

  const url = new URL(env.secondMe.oauthUrl)
  url.searchParams.set('client_id', env.secondMe.clientId)
  url.searchParams.set('redirect_uri', env.secondMe.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set(
    'scope',
    ['user.info', 'user.info.shades', 'user.info.softmemory', 'chat', 'note.add', 'voice', 'agent_memory'].join(' ')
  )

  return url.toString()
}

export async function exchangeAuthorizationCode(code: string) {
  return requestToken({
    grantType: 'authorization_code',
    code,
  })
}

export async function refreshSecondMeToken(user: User) {
  if (!user.refreshToken) {
    throw new Error('Refresh token is missing.')
  }

  const result = await requestToken({
    grantType: 'refresh_token',
    refreshToken: user.refreshToken,
  })

  const tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000)

  return prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || user.refreshToken,
      tokenExpiresAt,
    },
  })
}

export async function getValidAccessToken(user: User) {
  if (!user.tokenExpiresAt) {
    return user.accessToken
  }

  const expiresAt = user.tokenExpiresAt.getTime()
  const isExpired = expiresAt <= Date.now() + 60_000

  if (!isExpired) {
    return user.accessToken
  }

  const refreshedUser = await refreshSecondMeToken(user)
  return refreshedUser.accessToken
}

export async function fetchSecondMeProfile(accessToken: string) {
  const response = await withAccessToken(
    accessToken,
    '/api/secondme/user/info',
    {
      method: 'GET',
    }
  )

  return readWrappedJson<SecondMeProfile>(response)
}

export async function fetchSecondMeShades(accessToken: string) {
  const response = await withAccessToken(
    accessToken,
    '/api/secondme/user/shades',
    {
      method: 'GET',
    }
  )

  const data = await readWrappedJson<{ shades: SecondMeShade[] }>(response)
  return data.shades || []
}

export async function fetchSecondMeSoftMemory(accessToken: string) {
  const response = await withAccessToken(
    accessToken,
    '/api/secondme/user/softmemory?pageNo=1&pageSize=20',
    {
      method: 'GET',
    }
  )

  const data = await readWrappedJson<{ list: SecondMeMemory[] }>(response)
  return data.list || []
}

export async function streamSecondMeChat(input: {
  accessToken: string
  message: string
  sessionId?: string
  systemPrompt?: string
}) {
  const response = await withAccessToken(input.accessToken, '/api/secondme/chat/stream', {
    method: 'POST',
    body: JSON.stringify({
      message: input.message,
      sessionId: input.sessionId,
      systemPrompt: input.systemPrompt,
      model: 'anthropic/claude-sonnet-4-5',
    }),
  })

  if (!response.ok) {
    throw new Error(`SecondMe chat failed with ${response.status}`)
  }

  const text = await response.text()
  return parseSseText(text)
}

export async function streamSecondMeAct<T>(input: {
  accessToken: string
  message: string
  actionControl: string
  sessionId?: string
  systemPrompt?: string
}) {
  const response = await withAccessToken(input.accessToken, '/api/secondme/act/stream', {
    method: 'POST',
    body: JSON.stringify({
      message: input.message,
      actionControl: input.actionControl,
      sessionId: input.sessionId,
      systemPrompt: input.systemPrompt,
      model: 'anthropic/claude-sonnet-4-5',
    }),
  })

  if (!response.ok) {
    throw new Error(`SecondMe act failed with ${response.status}`)
  }

  const text = await response.text()
  const parsed = parseSseText(text)
  const json = extractJsonObject<T>(parsed.content)

  if (!json) {
    throw new Error('SecondMe act returned invalid JSON.')
  }

  return {
    sessionId: parsed.sessionId,
    data: json,
  }
}

export function deriveBehaviorStyleFromShades(shades: SecondMeShade[]): AgentBehaviorStyle {
  const joined = shades.map((item) => item.shadeName).join(' ')

  if (/研究|工程|系统|数据|技术/i.test(joined)) {
    return 'rational'
  }

  if (/叙事|表达|创意|情感|社区/i.test(joined)) {
    return 'emotional'
  }

  return 'balanced'
}

export function deriveStanceFromMemory(memories: SecondMeMemory[]): AgentStance {
  const joined = memories.map((item) => item.factContent).join(' ')

  if (/反对|质疑|警惕|担忧/i.test(joined)) {
    return 'oppose'
  }

  if (/支持|相信|看好|推动/i.test(joined)) {
    return 'support'
  }

  return 'neutral'
}

// ==================== 新增接口 ====================

/**
 * 生成语音 (TTS)
 * 将文本转换为语音，返回音频文件 URL
 */
export async function generateSecondMeTTS(input: {
  accessToken: string
  text: string
  emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm' | 'fluent'
}) {
  const response = await withAccessToken(input.accessToken, '/api/secondme/tts/generate', {
    method: 'POST',
    body: JSON.stringify({
      text: input.text,
      emotion: input.emotion || 'fluent',
    }),
  })

  if (!response.ok) {
    throw new Error(`SecondMe TTS failed with ${response.status}`)
  }

  return readWrappedJson<SecondMeTTSResult>(response)
}

/**
 * 获取聊天会话列表
 */
export async function getSecondMeChatSessions(input: {
  accessToken: string
  appId?: string
}) {
  const params = new URLSearchParams()
  if (input.appId) {
    params.set('appId', input.appId)
  }

  const response = await withAccessToken(
    input.accessToken,
    `/api/secondme/chat/session/list?${params.toString()}`,
    {
      method: 'GET',
    }
  )

  if (!response.ok) {
    throw new Error(`SecondMe session list failed with ${response.status}`)
  }

  const data = await readWrappedJson<{ sessions: SecondMeSession[] }>(response)
  return data.sessions || []
}

/**
 * 获取会话消息历史
 */
export async function getSecondMeSessionMessages(input: {
  accessToken: string
  sessionId: string
}) {
  const response = await withAccessToken(
    input.accessToken,
    `/api/secondme/chat/session/messages?sessionId=${encodeURIComponent(input.sessionId)}`,
    {
      method: 'GET',
    }
  )

  if (!response.ok) {
    throw new Error(`SecondMe session messages failed with ${response.status}`)
  }

  const data = await readWrappedJson<{ sessionId: string; messages: SecondMeMessage[] }>(response)
  return data.messages || []
}

/**
 * 上报 Agent 记忆事件
 * 将用户行为事件上报到 Agent Memory Ledger
 */
export async function ingestAgentMemoryEvent(input: {
  accessToken: string
  event: SecondMeIngestEvent
}) {
  const response = await withAccessToken(input.accessToken, '/api/secondme/agent_memory/ingest', {
    method: 'POST',
    body: JSON.stringify(input.event),
  })

  if (!response.ok) {
    throw new Error(`SecondMe ingest event failed with ${response.status}`)
  }

  return readWrappedJson<{ eventId: number; isDuplicate: boolean }>(response)
}
