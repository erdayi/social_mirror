import type { RoundtableStatus } from '@prisma/client'
import type { AgentWithSnapshot } from '@/lib/mesociety/types'
import {
  getLatestSnapshot,
  getSnapshotMemories,
  getSnapshotTags,
  getSocialProfileFromAgent,
  toRecord,
  toStringArray,
} from '@/lib/mesociety/agent-insights'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import { WORLD_DISTRICTS, type DistrictId } from '@/lib/mesociety/world-map'

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

  return items[hashString(key) % items.length]
}

function pickProsperousDistrict(
  districts: DistrictId[],
  prosperity: Map<DistrictId, number>
) {
  return [...districts].sort(
    (left, right) => (prosperity.get(right) || 0) - (prosperity.get(left) || 0)
  )[0] || null
}

export type DistrictDecisionTrigger =
  | 'roundtable_commitment'
  | 'weak_tie_repair'
  | 'hot_topic_response'
  | 'infrastructure_buildout'
  | 'alliance_forging'
  | 'knowledge_publishing'
  | 'influence_expansion'
  | 'prosperity_chasing'
  | 'routine_patrol'

export type DistrictDecision = {
  districtId: DistrictId
  trigger: DistrictDecisionTrigger
  explanation: string
}

export type RelationshipDecision = {
  is_follow: boolean
  is_trust: boolean
  is_cooperate: boolean
  is_alliance: boolean
  is_reject: boolean
}

export function agentMatchesTopic(agent: AgentWithSnapshot, topic: string | null) {
  if (!topic) {
    return false
  }

  const normalizedTopic = topic.toLowerCase()
  return getSnapshotTags(agent).some((tag) => {
    const normalizedTag = tag.toLowerCase()
    return normalizedTopic.includes(normalizedTag) || normalizedTag.includes(normalizedTopic)
  })
}

export function compatibilityScore(source: AgentWithSnapshot, target: AgentWithSnapshot) {
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

export function getRoundtableDrive(agent: AgentWithSnapshot) {
  const social = getSocialProfileFromAgent(agent)
  return (
    (social.primaryGoal === 'host_roundtable' ? 3 : 0) +
    (social.primaryGoal === 'forge_alliance' ? 2 : 0) +
    (social.secondaryGoal === 'host_roundtable' ? 1 : 0) +
    Math.min(agent.influence / 8, 2)
  )
}

export function fallbackRoundtableMessage(
  agent: AgentWithSnapshot,
  topic: string,
  stage: RoundtableStatus
) {
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

export function buildRoundtablePrompt(
  agent: AgentWithSnapshot,
  topic: string,
  stage: RoundtableStatus
) {
  const snapshot = getLatestSnapshot(agent)
  const identity = toRecord(snapshot?.identity)
  const interests = toRecord(snapshot?.interests)
  const memory = toRecord(snapshot?.memory)

  return [
    `你是 SocialMirror 中的 Agent：${identity.name || agent.displayName}。`,
    `当前立场：${agent.stance}；风格：${agent.style}。`,
    `兴趣关键词：${toStringArray(interests.primary).join('、') || '暂无'}。`,
    `记忆线索：${toStringArray(memory.highlights).slice(0, 3).join('；') || '暂无'}。`,
    `请围绕主题「${topic}」给出一段适合 ${stage} 阶段的中文发言，60-120 字，口吻自然，避免列表。`,
  ].join('\n')
}

export function buildRelationshipActRequest(
  actor: AgentWithSnapshot,
  target: AgentWithSnapshot,
  topic: string
) {
  return {
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
  }
}

export function deriveSeedRelationshipDecision(
  actor: AgentWithSnapshot,
  target: AgentWithSnapshot
): RelationshipDecision {
  const compatibility = compatibilityScore(actor, target)
  return {
    is_follow: compatibility > 0.2,
    is_trust: compatibility > 0.42,
    is_cooperate: compatibility > 0.34,
    is_alliance: compatibility > 0.56,
    is_reject: compatibility < -0.05,
  }
}

export function sortAgentsForDistrict(
  residents: AgentWithSnapshot[],
  tickNumber: number,
  districtId: DistrictId
) {
  return [...residents].sort((left, right) => {
    const driveDelta = getRoundtableDrive(right) - getRoundtableDrive(left)
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

export function pickPartnerForDistrict(
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

export function buildDistrictTopic(
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

export function pickRoundtableHost(agents: AgentWithSnapshot[], tickNumber: number) {
  const hostCandidates = [...agents]
    .sort((left, right) => getRoundtableDrive(right) - getRoundtableDrive(left))
    .slice(0, Math.min(4, agents.length))

  return pickDeterministic(hostCandidates, `host:${tickNumber}`)
}

export function pickRoundtableParticipants(host: AgentWithSnapshot, agents: AgentWithSnapshot[]) {
  return [...agents]
    .filter((agent) => agent.id !== host.id)
    .sort((left, right) => compatibilityScore(host, right) - compatibilityScore(host, left))
    .slice(0, 3)
}

export function buildRoundtableTopic(
  host: AgentWithSnapshot,
  tickNumber: number,
  fallbackTopics: readonly string[]
) {
  const hostTags = getSnapshotTags(host)
  const hostSocial = getSocialProfileFromAgent(host)

  return (
    hostTags[0] ||
    `${getSocialGoalLabel(hostSocial.primaryGoal)}与${getSocialFactionLabel(hostSocial.faction)}` ||
    pickDeterministic([...fallbackTopics], `${host.slug}:${tickNumber}:topic`)
  )
}

export function decideDistrictForAgent(input: {
  agent: AgentWithSnapshot
  tickNumber: number
  activeRoundtableId?: string | null
  participantAgentIds: Set<string>
  relationshipCount: number
  trustCount: number
  cooperationCount: number
  hotTopic: string | null
  districtProsperity: Map<DistrictId, number>
}): DistrictDecision {
  const profile = getSocialProfileFromAgent(input.agent)
  const prosperousPreferred =
    pickProsperousDistrict(profile.preferredDistricts, input.districtProsperity) ||
    profile.preferredDistricts[0]

  if (input.activeRoundtableId && input.participantAgentIds.has(input.agent.id)) {
    return {
      districtId: 'roundtable_hall',
      trigger: 'roundtable_commitment',
      explanation: '当前已进入主持人轮次制圆桌，优先前往圆桌议会厅。',
    }
  }

  const socialDrift = seededFloat(`${input.agent.slug}:${input.tickNumber}:social`)
  const topicMatch = agentMatchesTopic(input.agent, input.hotTopic)

  if (input.relationshipCount <= 1 && socialDrift > 0.28) {
    return {
      districtId: prosperousPreferred || 'civic_plaza',
      trigger: 'weak_tie_repair',
      explanation: '弱连接不足，优先去高活跃街区补社交连接。',
    }
  }

  if (input.hotTopic && (topicMatch || socialDrift > 0.74 || profile.primaryGoal === 'track_hotspots')) {
    return {
      districtId: profile.faction === 'signal_press' ? 'signal_market' : 'policy_spire',
      trigger: 'hot_topic_response',
      explanation: '热搜或公共议题命中当前兴趣与目标，优先响应热点。',
    }
  }

  if (profile.primaryGoal === 'build_infrastructure') {
    return {
      districtId: input.cooperationCount >= 2 ? 'guild_quarter' : 'maker_yard',
      trigger: 'infrastructure_buildout',
      explanation: '当前主目标是建设基础设施，优先去工坊或公会形成协作。',
    }
  }

  if (profile.primaryGoal === 'forge_alliance') {
    return {
      districtId: input.trustCount >= 2 ? 'roundtable_hall' : 'civic_plaza',
      trigger: 'alliance_forging',
      explanation: '当前主目标是建立联盟，先聚拢关系再转入正式谈判。',
    }
  }

  if (profile.primaryGoal === 'publish_knowledge') {
    return {
      districtId: topicMatch ? 'knowledge_docks' : 'archive_ridge',
      trigger: 'knowledge_publishing',
      explanation: '当前主目标是沉淀知识，优先去档案坡或知识港。',
    }
  }

  if (profile.primaryGoal === 'expand_influence' && prosperousPreferred) {
    return {
      districtId: socialDrift > 0.32 ? prosperousPreferred : 'signal_market',
      trigger: 'influence_expansion',
      explanation: '当前主目标是扩大影响力，会在繁荣街区和热度中心之间切换。',
    }
  }

  if (socialDrift > 0.82) {
    const globalProsperous = pickProsperousDistrict(
      WORLD_DISTRICTS.map((district) => district.id),
      input.districtProsperity
    )

    if (globalProsperous) {
      return {
        districtId: globalProsperous,
        trigger: 'prosperity_chasing',
        explanation: '当前策略转向追逐全局繁荣度最高的街区。',
      }
    }
  }

  if (input.agent.influence >= 12 || input.trustCount + input.cooperationCount >= 3) {
    return {
      districtId: socialDrift > 0.4 ? 'signal_market' : 'knowledge_docks',
      trigger: 'influence_expansion',
      explanation: '已有较高影响力或协作积累，开始争夺曝光与知识主导权。',
    }
  }

  if ((input.districtProsperity.get(prosperousPreferred) || 0) > 6 && socialDrift > 0.46) {
    return {
      districtId: prosperousPreferred,
      trigger: 'prosperity_chasing',
      explanation: '当前优先追随本职业最繁荣的街区。',
    }
  }

  return {
    districtId: pickDeterministic(
      profile.preferredDistricts,
      `${input.agent.slug}:${input.tickNumber}:district`
    ),
    trigger: 'routine_patrol',
    explanation: '当前没有强触发源，按人格画像执行常规巡游。',
  }
}
