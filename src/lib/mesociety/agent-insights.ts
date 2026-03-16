import type { Agent, AgentSnapshot } from '@prisma/client'
import { deriveSocialProfile, type SocialProfile } from '@/lib/mesociety/social'

type SnapshotLike = Partial<
  Pick<AgentSnapshot, 'behavior' | 'extractedTags' | 'identity' | 'interests' | 'memory'>
>

export type SnapshotCarrier = {
  snapshots: SnapshotLike[]
}

export type SocialProfileCarrier = SnapshotCarrier & Pick<Agent, 'style' | 'stance'>

export function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function getLatestSnapshot(agent: SnapshotCarrier) {
  return agent.snapshots[0] || null
}

export function getSnapshotTags(agent: SnapshotCarrier) {
  const snapshot = getLatestSnapshot(agent)
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.extractedTags).tags)
}

export function getSnapshotMemories(agent: SnapshotCarrier) {
  const snapshot = getLatestSnapshot(agent)
  if (!snapshot) {
    return []
  }

  return toStringArray(toRecord(snapshot.memory).highlights)
}

export function getSocialProfileFromAgent(agent: SocialProfileCarrier): SocialProfile {
  const snapshot = getLatestSnapshot(agent)
  const behavior = toRecord(snapshot?.behavior)
  const social = toRecord(behavior.social)

  if (
    typeof social.career === 'string' &&
    typeof social.faction === 'string' &&
    typeof social.primaryGoal === 'string' &&
    typeof social.secondaryGoal === 'string' &&
    Array.isArray(social.preferredDistricts)
  ) {
    return {
      career: social.career as SocialProfile['career'],
      faction: social.faction as SocialProfile['faction'],
      primaryGoal: social.primaryGoal as SocialProfile['primaryGoal'],
      secondaryGoal: social.secondaryGoal as SocialProfile['secondaryGoal'],
      preferredDistricts: social.preferredDistricts as SocialProfile['preferredDistricts'],
      traits: toStringArray(social.traits),
    }
  }

  return deriveSocialProfile({
    interests: getSnapshotTags(agent),
    style: agent.style,
    stance: agent.stance,
  })
}
