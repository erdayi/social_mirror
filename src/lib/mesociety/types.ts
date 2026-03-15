import type {
  Agent,
  AgentBehaviorStyle,
  AgentSnapshot,
  AgentStance,
  AgentStatus,
  AgentSource,
  Roundtable,
  RoundtableParticipant,
  RoundtableTurn,
  ScoreSnapshot,
  SocialEvent,
  User,
  ZonePresence,
  ZoneType,
  ZhihuIntegrationState,
} from '@prisma/client'

export type AgentWithSnapshot = Agent & {
  snapshots: AgentSnapshot[]
  zonePresence: ZonePresence | null
  user?: User | null
}

export type RoundtableWithRelations = Roundtable & {
  participants: Array<RoundtableParticipant & { agent: Agent }>
  turns: Array<RoundtableTurn & { speakerAgent: Agent | null }>
  hostAgent: Agent
}

export type LeaderboardEntry = {
  agentId: string
  name: string
  source: AgentSource
  portraitPath: string
  totalScore: number
  connectionScore: number
  trustScore: number
  cooperationScore: number
  integrationScore: number
  currentZone: ZoneType
  pixelRole: string
  pixelPalette: string
  status: AgentStatus
  rank: number
}

export type WorldAgentView = {
  id: string
  name: string
  source: AgentSource
  portraitPath: string
  status: AgentStatus
  zone: ZoneType
  x: number
  y: number
  pixelRole: string
  pixelPalette: string
  stance: AgentStance
  style: AgentBehaviorStyle
  influence: number
}

export type WorldEventView = Pick<SocialEvent, 'id' | 'type' | 'topic' | 'summary' | 'createdAt'> & {
  actorName?: string
  targetName?: string
  zone?: ZoneType | null
}

export type WorldStateView = {
  tickCount: number
  lastTickAt: string | null
  intervals: {
    tickMs: number
  }
  zones: Array<{
    id: ZoneType
    label: string
    description: string
  }>
  agents: WorldAgentView[]
  leaderboard: LeaderboardEntry[]
  activeRoundtable: RoundtableSummary | null
  recentEvents: WorldEventView[]
  zhihu: ZhihuStatusView[]
}

export type AgentDetailView = {
  agent: WorldAgentView & {
    bio: string | null
    slug: string
    isPlayable: boolean
    snapshot: {
      identity: Record<string, unknown>
      interests: Record<string, unknown>
      memory: Record<string, unknown>
      behavior: Record<string, unknown>
      extractedTags: Record<string, unknown>
    } | null
  }
  latestScore: LeaderboardEntry | null
  relationships: Array<{
    id: string
    type: string
    strength: number
    sourceName: string
    targetName: string
  }>
  recentEvents: WorldEventView[]
}

export type RoundtableSummary = {
  id: string
  topic: string
  status: Roundtable['status']
  hostName: string
  hostId: string
  hostPortraitPath: string
  participants: Array<{
    id: string
    name: string
    role: string
    contributionScore: number
    source: AgentSource
    portraitPath: string
  }>
  summary: string | null
  knowledge: {
    topic: string
    keyInsight: string
    participants: string[]
  } | null
  turns: Array<{
    id: string
    stage: string
    speakerId: string | null
    speakerName: string | null
    origin: string | null
    degraded: boolean
    content: string
    createdAt: string
  }>
}

export type GraphView = {
  nodes: Array<{
    id: string
    key: string
    type: string
    label: string
    size: number
  }>
  edges: Array<{
    id: string
    type: string
    source: string
    target: string
    weight: number
  }>
}

export type ZhihuStatusView = {
  id: string
  label: string
  state: ZhihuIntegrationState
  description: string
}

export type ScoreCard = Pick<
  ScoreSnapshot,
  | 'totalScore'
  | 'connectionScore'
  | 'trustScore'
  | 'cooperationScore'
  | 'integrationScore'
>
