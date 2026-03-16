import type { WorldStateView } from '@/lib/mesociety/types'

export type WorldStreamEvent =
  | { type: 'world_tick'; payload: { tickCount: number; lastTickAt: string | null } }
  | { type: 'leaderboard_changed'; payload: { leaders: Array<{ agentId: string; score: number; rank: number }> } }
  | { type: 'roundtable_advanced'; payload: { roundtableId: string; topic: string; status: string; turnId: string | null } }
  | { type: 'relationship_changed'; payload: { eventId: string; summary: string | null; actorId?: string; targetId?: string } }
  | { type: 'hot_topic_updated'; payload: { topics: string[] } }
  | { type: 'ring_content_updated'; payload: { circles: string[] } }

export function buildWorldStreamEvents(
  previous: WorldStateView | null,
  next: WorldStateView
): WorldStreamEvent[] {
  const events: WorldStreamEvent[] = [
    {
      type: 'world_tick',
      payload: {
        tickCount: next.tickCount,
        lastTickAt: next.lastTickAt,
      },
    },
  ]

  const nextLeaders = next.leaderboard.slice(0, 3).map((entry) => ({
    agentId: entry.agentId,
    score: entry.totalScore,
    rank: entry.rank,
  }))
  const prevLeaderSignature = JSON.stringify(
    previous?.leaderboard.slice(0, 3).map((entry) => ({
      agentId: entry.agentId,
      score: entry.totalScore,
      rank: entry.rank,
    })) || []
  )
  const nextLeaderSignature = JSON.stringify(nextLeaders)

  if (!previous || prevLeaderSignature !== nextLeaderSignature) {
    events.push({
      type: 'leaderboard_changed',
      payload: { leaders: nextLeaders },
    })
  }

  const prevTurnId =
    previous?.activeRoundtable?.turns[previous.activeRoundtable.turns.length - 1]?.id || null
  const nextTurnId =
    next.activeRoundtable?.turns[next.activeRoundtable.turns.length - 1]?.id || null

  if (
    next.activeRoundtable &&
    (!previous ||
      previous.activeRoundtable?.id !== next.activeRoundtable.id ||
      previous.activeRoundtable?.status !== next.activeRoundtable.status ||
      prevTurnId !== nextTurnId)
  ) {
    events.push({
      type: 'roundtable_advanced',
      payload: {
        roundtableId: next.activeRoundtable.id,
        topic: next.activeRoundtable.topic,
        status: next.activeRoundtable.status,
        turnId: nextTurnId,
      },
    })
  }

  const relationshipEvent = next.recentEvents.find((event) =>
    ['follow', 'trust', 'cooperate', 'alliance', 'reject'].includes(event.type)
  )
  if (relationshipEvent && relationshipEvent.id !== previous?.recentEvents[0]?.id) {
    events.push({
      type: 'relationship_changed',
      payload: {
        eventId: relationshipEvent.id,
        summary: relationshipEvent.summary,
        actorId: relationshipEvent.actorId,
        targetId: relationshipEvent.targetId,
      },
    })
  }

  const prevHot = JSON.stringify(previous?.externalSignals.hotTopics.map((item) => item.id) || [])
  const nextHot = JSON.stringify(next.externalSignals.hotTopics.map((item) => item.id))
  if (!previous || prevHot !== nextHot) {
    events.push({
      type: 'hot_topic_updated',
      payload: {
        topics: next.externalSignals.hotTopics.slice(0, 3).map((item) => item.title),
      },
    })
  }

  const prevCircles = JSON.stringify(previous?.externalSignals.circles.map((item) => item.id) || [])
  const nextCircles = JSON.stringify(next.externalSignals.circles.map((item) => item.id))
  if (!previous || prevCircles !== nextCircles) {
    events.push({
      type: 'ring_content_updated',
      payload: {
        circles: next.externalSignals.circles.slice(0, 2).map((item) => item.title),
      },
    })
  }

  return events
}
