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
  User,
  ZonePresence,
  ZoneType,
  ZhihuIntegrationState,
} from '@prisma/client'
import type {
  SocialCareer,
  SocialFaction,
  SocialGoal,
} from '@/lib/mesociety/social'
import type { DistrictId } from '@/lib/mesociety/world-map'

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
  districtId: DistrictId
  districtLabel: string
  workPointId: string | null
  workPointLabel: string | null
  career: SocialCareer
  faction: SocialFaction
  primaryGoal: SocialGoal
  secondaryGoal: SocialGoal
}

export type WorldEventView = {
  id: string
  type: string
  topic: string | null
  summary: string | null
  createdAt: Date | string
  actorId?: string
  actorName?: string
  targetId?: string
  targetName?: string
  zone?: ZoneType | null
  metadata?: Record<string, unknown> | null
}

export type AgentSocietyStats = {
  productionScore: number
  resourceScore: number
  allianceScore: number
  tradeScore: number
  knowledgeScore: number
  socialCapital: number
  momentumLabel: string
}

export type SocietyPulseView = {
  activeWorkers: number
  allianceEdges: number
  knowledgeOutputs: number
  liveTopics: number
  outputUnits: number
  exchangeLinks: number
  investmentUnits: number
  consumptionUnits: number
  systemBalanceUnits: number
  dominantResource: string
}

export type EconomyFlowView = {
  resource: string
  label: string
  outputUnits: number
  exchangeCount: number
  investmentUnits: number
  consumptionUnits: number
  balanceUnits: number
  dominantDistrict: string
}

export type EconomyWorkPointView = {
  workPointId: string
  label: string
  districtLabel: string
  resourceLabel: string
  activeAgents: number
  outputUnits: number
  exchangeCount: number
}

export type DistrictProsperityView = {
  districtId: DistrictId
  label: string
  prosperityScore: number
  levelLabel: string
  stabilityLabel: string
  residentCount: number
  outputUnits: number
  exchangeCount: number
  dividendUnits: number
  investmentUnits: number
  upkeepUnits: number
  treasuryBalance: number
  allianceLinks: number
  knowledgeOutputs: number
  dominantResource: string
  trendLabel: string
}

export type AgentResourceInventoryView = {
  resource: string
  label: string
  producedUnits: number
  receivedUnits: number
  sharedUnits: number
  dividendUnits: number
  consumedUnits: number
  investedUnits: number
  netUnits: number
}

export type AgentAllianceDividendView = {
  receivedUnits: number
  sharedUnits: number
  activePartners: number
  topPartner: string | null
}

export type AgentEconomyView = {
  totalInventoryUnits: number
  consumptionUnits: number
  investmentUnits: number
  supportBalance: number
  stewardshipLabel: string
  dominantResource: string
  resources: AgentResourceInventoryView[]
  allianceDividend: AgentAllianceDividendView
}

export type DistrictUpgradePlanView = {
  districtId: DistrictId
  districtLabel: string
  title: string
  description: string
  requiredResourceKey: string
  requiredResourceLabel: string
  requiredUnits: number
  fundedUnits: number
  progressPercent: number
  stage: string
  sponsorAgentId: string | null
  sponsorAgentName: string | null
}

export type AllianceDividendRouteView = {
  sourceAgentId: string
  sourceAgentName: string
  targetAgentId: string
  targetAgentName: string
  units: number
  relationshipType: string
  districtLabel: string
  resourceLabel: string
}

export type SocietyEconomyView = {
  totalOutputUnits: number
  totalExchangeLinks: number
  totalDividendUnits: number
  totalInvestmentUnits: number
  totalConsumptionUnits: number
  systemBalanceUnits: number
  dominantResource: string
  mostProsperousDistrict: string
  flows: EconomyFlowView[]
  workPoints: EconomyWorkPointView[]
  districts: DistrictProsperityView[]
  projects: DistrictUpgradePlanView[]
  dividendRoutes: AllianceDividendRouteView[]
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
  pulse: SocietyPulseView
  economy: SocietyEconomyView
  map: {
    width: number
    height: number
    chunkSize: number
    workPoints: Array<{
      id: string
      districtId: DistrictId
      label: string
      kind: string
      x: number
      y: number
    }>
    districts: Array<{
      id: DistrictId
      label: string
      description: string
      x: number
      y: number
      width: number
      height: number
      zoneFocus: ZoneType
      theme: string
    }>
  }
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
  societyStats: AgentSocietyStats
  economy: AgentEconomyView
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
  hostPixelRole: string
  hostPixelPalette: string
  participants: Array<{
    id: string
    name: string
    role: string
    contributionScore: number
    source: AgentSource
    portraitPath: string
    pixelRole: string
    pixelPalette: string
    status: AgentStatus
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
    audioUrl: string | null
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
  meta: {
    backend: 'mysql' | 'neo4j'
    neo4jStatus: 'not_configured' | 'driver_missing' | 'connected' | 'error'
    reason?: string | null
  }
}

export type ZhihuStatusView = {
  id: string
  label: string
  state: ZhihuIntegrationState
  description: string
  worldRole?: string
  expectedData?: string
  integrationHint?: string
}

export type ScoreCard = Pick<
  ScoreSnapshot,
  | 'totalScore'
  | 'connectionScore'
  | 'trustScore'
  | 'cooperationScore'
  | 'integrationScore'
>
