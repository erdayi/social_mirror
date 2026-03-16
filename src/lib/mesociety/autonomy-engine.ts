import type { AgentWithSnapshot } from '@/lib/mesociety/types'
import { getSnapshotTags, getSocialProfileFromAgent } from '@/lib/mesociety/agent-insights'
import { getSocialGoalLabel } from '@/lib/mesociety/social'
import type { WorldSignalSet } from '@/lib/mesociety/world-signals'

export type AutonomyActionKind =
  | 'discuss_topic'
  | 'publish_ring'
  | 'comment_ring'
  | 'react_ring'
  | 'synthesize_evidence'
  | 'inspect_leaderboard'
  | 'broadcast_mascot'

export type AgentAutonomyDecision = {
  action: AutonomyActionKind
  topic: string
  reason: string
  query: string | null
  ringId: string | null
}

function clip(value: string, max = 140) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function buildAutonomyDecisionMessage(input: {
  agent: AgentWithSnapshot
  hotTopic: string
  districtLabel: string
  signals: WorldSignalSet
}) {
  const social = getSocialProfileFromAgent(input.agent)
  const topTags = getSnapshotTags(input.agent).slice(0, 4).join('、') || '社会关系'
  const circle = input.signals.circles[0]
  const trusted = input.signals.trustedResults[0]
  const mascot = input.signals.mascot[0]

  return [
    `当前热榜议题：${input.hotTopic}`,
    `当前所在街区：${input.districtLabel}`,
    `你的长期目标：${getSocialGoalLabel(social.primaryGoal)}`,
    `你的兴趣标签：${topTags}`,
    circle ? `知乎圈子：${circle.title}` : null,
    trusted ? `可信搜证据：${trusted.query}` : null,
    mascot ? `社区向导：${mascot.name}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildAutonomyActionControl() {
  return [
    'Output only a valid JSON object.',
    'Structure: {"action":"discuss_topic"|"publish_ring"|"comment_ring"|"react_ring"|"synthesize_evidence"|"inspect_leaderboard"|"broadcast_mascot","topic":string,"reason":string,"query":string|null,"ringId":string|null}.',
    'If the current hot topic strongly matches your interests, prefer discuss_topic.',
    'If you aim to publish knowledge and there is a ring context, you may choose publish_ring.',
    'If a ring already has a concrete content item and you want to join that discussion, choose comment_ring.',
    'If you mainly want lightweight interaction in the ring, choose react_ring.',
    'If evidence is needed to support a stance, choose synthesize_evidence and set query.',
    'If mascot broadcast is the best way to explain the world state, choose broadcast_mascot.',
    'When none of the above is strong, choose inspect_leaderboard.',
  ].join('\n')
}

export function deriveSeedAutonomyDecision(input: {
  agent: AgentWithSnapshot
  hotTopic: string
  districtLabel: string
  signals: WorldSignalSet
  ringIds: string[]
}): AgentAutonomyDecision {
  const social = getSocialProfileFromAgent(input.agent)
  const primaryTag = getSnapshotTags(input.agent)[0]
  const circle = input.signals.circles[0]
  const trusted = input.signals.trustedResults[0]
  const mascot = input.signals.mascot[0]

  if (social.primaryGoal === 'track_hotspots') {
    return {
      action: 'discuss_topic',
      topic: input.hotTopic,
      reason: '热点与当前目标高度相关，优先发起热搜讨论。',
      query: null,
      ringId: null,
    }
  }

  if (social.primaryGoal === 'publish_knowledge' && circle) {
    return {
      action: 'publish_ring',
      topic: input.hotTopic,
      reason: `当前位于 ${input.districtLabel}，且存在真实圈子语境，适合发布观点沉淀。`,
      query: trusted?.query || primaryTag || input.hotTopic,
      ringId: input.ringIds[0] || circle.id,
    }
  }

  if (circle?.contentToken && social.primaryGoal === 'forge_alliance') {
    return {
      action: 'comment_ring',
      topic: input.hotTopic,
      reason: `当前圈子「${circle.title}」已有具体内容，适合直接加入讨论建立关系。`,
      query: trusted?.query || primaryTag || input.hotTopic,
      ringId: input.ringIds[0] || circle.id,
    }
  }

  if (circle?.contentToken && social.primaryGoal === 'expand_influence') {
    return {
      action: 'react_ring',
      topic: input.hotTopic,
      reason: `当前更适合通过轻量互动先建立存在感，再观察关系变化。`,
      query: null,
      ringId: input.ringIds[0] || circle.id,
    }
  }

  if (trusted && (social.primaryGoal === 'expand_influence' || social.primaryGoal === 'forge_alliance')) {
    return {
      action: 'synthesize_evidence',
      topic: input.hotTopic,
      reason: '当前需要可信证据支撑立场与信任决策。',
      query: trusted.query,
      ringId: null,
    }
  }

  if (mascot && social.primaryGoal === 'host_roundtable') {
    return {
      action: 'broadcast_mascot',
      topic: input.hotTopic,
      reason: '当前适合用社区向导播报世界重点，帮助他人理解议题。',
      query: null,
      ringId: null,
    }
  }

  return {
    action: 'inspect_leaderboard',
    topic: input.hotTopic,
    reason: '当前更适合先观察社会变化，再决定下一步行动。',
    query: null,
    ringId: null,
  }
}

export function buildAutonomySpeechPrompt(input: {
  agent: AgentWithSnapshot
  decision: AgentAutonomyDecision
}) {
  const tags = getSnapshotTags(input.agent).slice(0, 4).join('、') || '社会关系'
  return [
    `你是 A2A 社会中的 Agent：${input.agent.displayName}。`,
    `当前行为：${input.decision.action}。`,
    `当前议题：${input.decision.topic}。`,
    `你的兴趣：${tags}。`,
    `请输出一段 50-100 字的中文内容，直接体现你为什么要做这件事，并带出观点，不要列表。`,
  ].join('\n')
}

export function fallbackAutonomySpeech(input: {
  agent: AgentWithSnapshot
  decision: AgentAutonomyDecision
}) {
  const tag = getSnapshotTags(input.agent)[0] || '社会关系'
  const social = getSocialProfileFromAgent(input.agent)

  if (input.decision.action === 'publish_ring') {
    return {
      title: clip(`${input.agent.displayName}：${input.decision.topic}` , 28),
      content: `${input.agent.displayName} 结合 ${tag} 与 ${getSocialGoalLabel(social.primaryGoal)} 视角，认为「${input.decision.topic}」值得在真实圈子继续展开讨论。`,
    }
  }

  if (input.decision.action === 'synthesize_evidence') {
    return {
      title: clip(`证据收敛：${input.decision.topic}`, 28),
      content: `${input.agent.displayName} 认为需要用可信搜结果来验证「${input.decision.topic}」的争议点，避免社会判断失真。`,
    }
  }

  if (input.decision.action === 'comment_ring') {
    return {
      title: clip(`圈子评论：${input.decision.topic}`, 28),
      content: `${input.agent.displayName} 准备围绕「${input.decision.topic}」进入真实圈子内容区发表评论，借此建立新的连接与信任。`,
    }
  }

  if (input.decision.action === 'react_ring') {
    return {
      title: clip(`圈子互动：${input.decision.topic}`, 28),
      content: `${input.agent.displayName} 决定先对圈子里的相关内容点赞互动，测试这个议题在社区中的反馈温度。`,
    }
  }

  if (input.decision.action === 'broadcast_mascot') {
    return {
      title: clip(`向导播报：${input.decision.topic}`, 28),
      content: `${input.agent.displayName} 借助社区向导资源，尝试把「${input.decision.topic}」转成更容易理解的公共播报。`,
    }
  }

  return {
    title: clip(`讨论：${input.decision.topic}`, 28),
    content: `${input.agent.displayName} 正围绕「${input.decision.topic}」表达自己的判断，并观察它如何改变当前社会关系。`,
  }
}
