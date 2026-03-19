import type { ZoneType } from '@prisma/client'
import type {
  WorldAgentView,
  WorldEventView,
  WorldStateView,
  ZhihuCircleSignalView,
  ZhihuHotSignalView,
  ZhihuMascotSignalView,
  ZhihuTrustedSignalView,
  DiscussionSource,
} from '@/lib/mesociety/types'

// Define view types locally
export type AgentIntentView = {
  agentId: string
  name: string
  zone: string
  districtLabel: string
  currentTarget: string
  actionLabel: string
  triggerSource: DiscussionSource
  triggerLabel: string
  rationale: string
  recentSpeech: string | null
  scoreDeltaLabel: string
}

export type AgentZhihuParticipationView = {
  hotTopicHits: number
  circleActions: number
  evidenceReferences: number
  controlledActions: Array<{
    label: string
    summary: string
  }>
}

export type MascotBriefView = {
  title: string
  summary: string
  callout: string
  assetPath: string | null
  role: string
}

export type RoundtableEvidenceCardView = {
  id: string
  kind: string
  title: string
  summary: string
  sourceLabel: string
  href?: string
}

export type ScoreExplanationView = {
  headline: string
  summary: string
  drivers: Array<{ label: string; detail: string; value: number }>
  evidence: string[]
}

export type WorldFocusView = {
  source: DiscussionSource
  sourceLabel: string
  title: string
  summary?: string
  reason?: string
  heatLabel?: string
  updatedAtLabel?: string
}

function formatTimeLabel(value: string | Date | null | undefined) {
  if (!value) {
    return '刚刚'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚'
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function getDiscussionSourceLabel(source: DiscussionSource) {
  if (source === 'zhihu_hot') {
    return '知乎热榜'
  }
  if (source === 'zhihu_ring') {
    return '知乎圈子'
  }
  if (source === 'trusted_search') {
    return '知乎可信搜'
  }
  if (source === 'relationship') {
    return '关系张力'
  }
  if (source === 'memory') {
    return 'SecondMe 记忆'
  }
  return '系统保底'
}

export function buildCurrentFocusView(input: {
  activeRoundtable: WorldStateView['activeRoundtable']
  recentEvents: WorldEventView[]
  hotTopics: ZhihuHotSignalView[]
  circles: ZhihuCircleSignalView[]
  trustedResults: ZhihuTrustedSignalView[]
}) {
  const hotTopic = input.hotTopics[0] || null
  const circle = input.circles[0] || null
  const trusted = input.trustedResults[0] || null
  const latestTopicEvent =
    input.recentEvents.find((event) => Boolean(event.topic) || event.type === 'roundtable_summary') || null

  if (hotTopic) {
    return {
      source: 'zhihu_hot',
      sourceLabel: getDiscussionSourceLabel('zhihu_hot'),
      title: hotTopic.title,
      summary: input.activeRoundtable
        ? `当前圆桌正在围绕热榜议题「${hotTopic.title}」推进，世界中的 Agent 会优先被这个外部信号吸引。`
        : `「${hotTopic.title}」是当前最强的外部事件源，Agent 会先围绕它聚集、发言与判断关系。`,
      reason: `因为该议题直接来自真实知乎热榜，所以它优先成为社会镜像的主话题。`,
      heatLabel: hotTopic.heat ? `热度 ${hotTopic.heat}` : '热榜信号已接入',
      updatedAtLabel: latestTopicEvent ? formatTimeLabel(latestTopicEvent.createdAt) : '刚刚',
    } satisfies WorldFocusView
  }

  if (circle) {
    return {
      source: 'zhihu_ring',
      sourceLabel: getDiscussionSourceLabel('zhihu_ring'),
      title: circle.title,
      summary: `当前没有可用热榜时，世界会退到真实圈子语境。${circle.title} 正为 Agent 提供社区氛围和讨论入口。`,
      reason: '圈子内容代表真实社区结构，所以它会成为下一优先级的社会触发源。',
      heatLabel: `成员 ${circle.memberCount} · 活跃 ${circle.activityScore}`,
      updatedAtLabel: '刚刚',
    } satisfies WorldFocusView
  }

  if (trusted) {
    return {
      source: 'trusted_search',
      sourceLabel: getDiscussionSourceLabel('trusted_search'),
      title: trusted.query,
      summary: `当前世界正在用「${trusted.query}」相关证据补强判断，让信任和协作不只由性格相似决定。`,
      reason: '当议题进入证据轮时，可信搜结果会直接影响 trust / cooperate 的结算。',
      heatLabel: `可信度 ${trusted.confidence}`,
      updatedAtLabel: '刚刚',
    } satisfies WorldFocusView
  }

  if (latestTopicEvent?.topic) {
    return {
      source: 'relationship',
      sourceLabel: getDiscussionSourceLabel('relationship'),
      title: latestTopicEvent.topic,
      summary: latestTopicEvent.summary || `近期社会事件把话题重新推回到「${latestTopicEvent.topic}」。`,
      reason: '当前主焦点来自最近的关系变化或圆桌延续，而不是新的外部热点。',
      heatLabel: '内部延续',
      updatedAtLabel: formatTimeLabel(latestTopicEvent.createdAt),
    } satisfies WorldFocusView
  }

  return {
    source: 'system',
    sourceLabel: getDiscussionSourceLabel('system'),
    title: '等待下一轮社会信号',
    summary: '当前世界正在等待新的热榜、圈子内容或关系冲突来重新点亮主议题。',
    reason: '为了避免伪造外部数据，系统在没有真实信号时只维持最低限度的自治巡游。',
    heatLabel: '保底运行',
    updatedAtLabel: '刚刚',
  } satisfies WorldFocusView
}

function resolveEventSource(event: WorldEventView | undefined | null): DiscussionSource {
  const zhihu = event?.metadata?.zhihu as Record<string, unknown> | undefined
  if (zhihu?.source === 'hot') {
    return 'zhihu_hot'
  }
  if (zhihu?.source === 'circles') {
    return 'zhihu_ring'
  }
  if (zhihu?.source === 'trusted_search') {
    return 'trusted_search'
  }
  if (zhihu?.source === 'mascot_assets') {
    return 'system'
  }

  if (event?.type === 'roundtable_summary' || event?.type === 'trust' || event?.type === 'cooperate') {
    return 'relationship'
  }

  return event?.topic ? 'memory' : 'system'
}

function resolveIntentAction(zone: ZoneType, latestEvent: WorldEventView | undefined, activeTopic: string) {
  if (latestEvent?.type === 'join_roundtable' || zone === 'roundtable') {
    return `围绕「${activeTopic}」入座圆桌`
  }
  if (latestEvent?.type === 'inspect_leaderboard' || zone === 'leaderboard') {
    return '观察榜单变化'
  }
  if (latestEvent?.type === 'discuss_topic' || zone === 'discussion') {
    return `追踪议题「${activeTopic}」`
  }
  return '在广场交换近况'
}

export function buildAgentIntentCards(input: {
  agents: WorldAgentView[]
  recentEvents: WorldEventView[]
  activeRoundtable: WorldStateView['activeRoundtable']
  currentFocus: WorldFocusView
  scoreDeltaMap?: Map<string, number>
}) {
  const latestEventByAgent = new Map<string, WorldEventView>()
  for (const event of input.recentEvents) {
    if (event.actorId && !latestEventByAgent.has(event.actorId)) {
      latestEventByAgent.set(event.actorId, event)
    }
  }

  const activeTurn = input.activeRoundtable?.turns[input.activeRoundtable.turns.length - 1] || null

  return input.agents.map<AgentIntentView>((agent) => {
    const latestEvent = latestEventByAgent.get(agent.id)
    const triggerSource = resolveEventSource(latestEvent) || input.currentFocus.source
    const delta = input.scoreDeltaMap?.get(agent.id)
    const recentSpeech =
      activeTurn?.speakerId === agent.id
        ? activeTurn.content
        : latestEvent?.summary || null

    return {
      agentId: agent.id,
      name: agent.name,
      zone: agent.zone,
      districtLabel: agent.districtLabel,
      currentTarget:
        latestEvent?.topic ||
        input.activeRoundtable?.topic ||
        input.currentFocus.title,
      actionLabel: resolveIntentAction(
        agent.zone,
        latestEvent,
        latestEvent?.topic || input.activeRoundtable?.topic || input.currentFocus.title
      ),
      triggerSource,
      triggerLabel: getDiscussionSourceLabel(triggerSource),
      rationale:
        latestEvent?.summary ||
        `${agent.name} 当前会优先响应 ${getDiscussionSourceLabel(triggerSource)}，并把动作落在 ${agent.districtLabel}。`,
      recentSpeech,
      scoreDeltaLabel:
        typeof delta === 'number'
          ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`
          : '待更新',
    }
  })
}

export function buildMascotBriefView(input: {
  currentFocus: WorldFocusView
  mascot: ZhihuMascotSignalView[]
  activeRoundtable: WorldStateView['activeRoundtable']
}) {
  const mascot = input.mascot[0] || null
  const roundtableTurn = input.activeRoundtable?.turns[input.activeRoundtable.turns.length - 1] || null

  return {
    title: mascot ? `${mascot.name} 的世界播报` : '刘看山快报',
    summary: `此刻应先关注「${input.currentFocus.title}」。${input.currentFocus.summary}`,
    callout: roundtableTurn
      ? `${roundtableTurn.speakerName || '系统'} 正在圆桌里推进最新一轮回应。`
      : '当前还没有新发言时，优先看主焦点和右侧实时事件流。',
    assetPath: mascot?.assetPath || null,
    role: mascot?.role || '世界讲解员',
  } satisfies MascotBriefView
}

export function buildScoreExplanationView(input: {
  agent: Pick<WorldAgentView, 'name'>
  latestScore: {
    totalScore: number
    connectionScore: number
    trustScore: number
    cooperationScore: number
    integrationScore: number
  } | null
  hotTopicParticipationCount: number
  circleParticipationCount: number
  evidenceScore: number
  roundtableCount: number
  followCount: number
  trustWeight: number
  cooperationWeight: number
  topicDiversity: number
  recentTopics: string[]
}) {
  const latestScore = input.latestScore || {
    totalScore: 0,
    connectionScore: 0,
    trustScore: 0,
    cooperationScore: 0,
    integrationScore: 0,
  }

  return {
    headline: `${input.agent.name} 当前综合分 ${latestScore.totalScore.toFixed(1)}`,
    summary: `${input.agent.name} 的分数不再来自随机热闹度，而是由热榜响应、可信证据、圆桌协作和持续融入四条链路共同决定。`,
    drivers: [
      {
        label: '社区触达',
        detail: `命中热榜 ${input.hotTopicParticipationCount} 次，进入圆桌/讨论 ${input.roundtableCount} 次，被其他 Agent 主动卷入 ${input.followCount} 次。`,
        value: latestScore.connectionScore,
      },
      {
        label: '证据可信',
        detail: `可信搜证据累计 ${input.evidenceScore.toFixed(1)}，当前互信边权重 ${input.trustWeight.toFixed(1)}。`,
        value: latestScore.trustScore,
      },
      {
        label: 'A2A 协同',
        detail: `合作边权重 ${input.cooperationWeight.toFixed(1)}，参与了 ${input.roundtableCount} 次多 Agent 协商。`,
        value: latestScore.cooperationScore,
      },
      {
        label: '社会融入',
        detail: `参与圈子 ${input.circleParticipationCount} 次，覆盖 ${input.topicDiversity} 类议题，表现出持续在线的社会适应性。`,
        value: latestScore.integrationScore,
      },
    ],
    evidence: input.recentTopics.length
      ? input.recentTopics.slice(0, 3).map((topic) => `最近参与议题：${topic}`)
      : ['当前还没有足够多的外部议题样本，下一轮热榜和圆桌会补全解释链路。'],
  } satisfies ScoreExplanationView
}

export function buildZhihuParticipationView(input: {
  hotTopicHits: number
  circleActions: number
  evidenceReferences: number
  controlledActions: Array<{
    label: string
    summary: string
  }>
}) {
  return {
    hotTopicHits: input.hotTopicHits,
    circleActions: input.circleActions,
    evidenceReferences: input.evidenceReferences,
    controlledActions: input.controlledActions.slice(0, 4),
  } satisfies AgentZhihuParticipationView
}

export function buildRoundtableEvidenceCards(input: {
  topic: string
  hotTopics: ZhihuHotSignalView[]
  circles: ZhihuCircleSignalView[]
  trustedResults: ZhihuTrustedSignalView[]
  mascot: ZhihuMascotSignalView[]
}) {
  const cards: RoundtableEvidenceCardView[] = []
  const hotTopic =
    input.hotTopics.find((item) => item.title === input.topic) ||
    input.hotTopics.find((item) => input.topic.includes(item.title) || item.title.includes(input.topic)) ||
    null
  const circle = input.circles[0] || null
  const trusted = input.trustedResults[0] || null
  const mascot = input.mascot[0] || null

  if (hotTopic) {
    cards.push({
      id: `hot:${hotTopic.id}`,
      kind: 'hot_topic',
      title: hotTopic.title,
      summary: `当前圆桌优先围绕真实热榜展开，因此这个议题会直接决定主持人选择和入桌优先级。`,
      sourceLabel: '知乎热榜',
      href: hotTopic.url,
    })
  }

  if (circle) {
    cards.push({
      id: `circle:${circle.id}`,
      kind: 'ring',
      title: circle.title,
      summary: circle.contentPreview
        ? `圈子回声：${circle.contentPreview}`
        : `圈子成员 ${circle.memberCount}，当前活跃度 ${circle.activityScore}。`,
      sourceLabel: '知乎圈子',
    })
  }

  if (trusted) {
    cards.push({
      id: `trusted:${trusted.id}`,
      kind: 'trusted_search',
      title: trusted.query,
      summary: trusted.summary || '可信搜结果会在证据轮中作为观点支撑。',
      sourceLabel: `知乎可信搜 · 可信度 ${trusted.confidence}`,
    })
  }

  if (mascot) {
    cards.push({
      id: `mascot:${mascot.id}`,
      kind: 'mascot',
      title: mascot.name,
      summary: mascot.note || '刘看山负责把复杂讨论翻译成一眼能看懂的公共播报。',
      sourceLabel: '刘看山 IP',
    })
  }

  return cards
}
