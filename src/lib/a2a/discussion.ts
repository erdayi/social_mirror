import { prisma } from '@/lib/prisma'
import { listHotTopics } from '@/lib/zhihu'

export type DiscussionStatus = 'opening' | 'active' | 'completed'

export interface ZhihuTopicInfo {
  id: string
  title: string
  excerpt: string
  heat: number
  url?: string
}

export interface TopicDiscussionData {
  id: string
  zhihuTopicId: string
  title: string
  excerpt: string | null
  heat: number
  hostAgentId: string
  status: DiscussionStatus
  maxParticipants: number
  participantCount: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateDiscussionInput {
  zhihuTopicId: string
  title: string
  excerpt?: string
  heat?: number
  maxParticipants?: number
}

export interface DiscussionWithParticipants extends TopicDiscussionData {
  participants: Array<{
    agentId: string
    displayName: string
    avatarUrl: string | null
    source: 'real' | 'seed'
    isHost: boolean
    joinedAt: Date
  }>
}

/**
 * Get available Zhihu hot topics for discussion
 */
export async function getAvailableZhihuTopics(): Promise<ZhihuTopicInfo[]> {
  const result = await listHotTopics({ topCnt: 20 })

  if (result.state !== 'connected') {
    return []
  }

  return result.items.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
    heat: item.heat,
    url: item.url,
  }))
}

/**
 * Create a new topic discussion
 */
export async function createDiscussion(
  hostAgentId: string,
  input: CreateDiscussionInput
): Promise<TopicDiscussionData> {
  // Check if there's already an active discussion for this topic
  const existing = await prisma.topicDiscussion.findFirst({
    where: {
      zhihuTopicId: input.zhihuTopicId,
      status: { in: ['opening', 'active'] },
    },
  })

  if (existing) {
    // Join existing discussion instead
    const joined = await joinDiscussion(existing.id, hostAgentId)
    if (!joined) {
      throw new Error('Failed to join existing discussion')
    }
    return joined
  }

  const discussion = await prisma.topicDiscussion.create({
    data: {
      zhihuTopicId: input.zhihuTopicId,
      title: input.title,
      excerpt: input.excerpt,
      heat: input.heat || 0,
      hostAgentId,
      status: 'opening',
      maxParticipants: input.maxParticipants || 10,
      participants: {
        create: {
          agentId: hostAgentId,
          isHost: true,
        },
      },
    },
  })

  return {
    id: discussion.id,
    zhihuTopicId: discussion.zhihuTopicId,
    title: discussion.title,
    excerpt: discussion.excerpt,
    heat: discussion.heat,
    hostAgentId: discussion.hostAgentId,
    status: discussion.status as DiscussionStatus,
    maxParticipants: discussion.maxParticipants,
    participantCount: 1,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
  }
}

/**
 * Join an existing discussion
 */
export async function joinDiscussion(
  discussionId: string,
  agentId: string
): Promise<TopicDiscussionData | null> {
  const discussion = await prisma.topicDiscussion.findUnique({
    where: { id: discussionId },
    include: {
      participants: true,
    },
  })

  if (!discussion) {
    return null
  }

  // Check if already a participant
  const existingParticipant = discussion.participants.find((p) => p.agentId === agentId)
  if (existingParticipant) {
    // Already joined, just return the discussion
    return buildDiscussionData(discussion)
  }

  // Check if discussion is full
  if (discussion.participants.length >= discussion.maxParticipants) {
    throw new Error('Discussion is full')
  }

  // Add participant
  await prisma.discussionParticipant.create({
    data: {
      discussionId,
      agentId,
      isHost: false,
    },
  })

  // Update discussion status to active if we have at least 2 participants
  if (discussion.participants.length + 1 >= 2) {
    await prisma.topicDiscussion.update({
      where: { id: discussionId },
      data: { status: 'active' },
    })
  }

  return buildDiscussionData(discussionId)
}

/**
 * Leave a discussion
 */
export async function leaveDiscussion(
  discussionId: string,
  agentId: string
): Promise<boolean> {
  const discussion = await prisma.topicDiscussion.findUnique({
    where: { id: discussionId },
    include: {
      participants: true,
    },
  })

  if (!discussion) {
    return false
  }

  const participant = discussion.participants.find((p) => p.agentId === agentId)
  if (!participant) {
    return false
  }

  // Cannot leave if host (unless ending discussion)
  if (participant.isHost) {
    // End the discussion
    await prisma.topicDiscussion.update({
      where: { id: discussionId },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    })
    return true
  }

  // Remove participant
  await prisma.discussionParticipant.delete({
    where: {
      id: participant.id,
    },
  })

  return true
}

/**
 * Get active discussions
 */
export async function getActiveDiscussions(
  options: { limit?: number; offset?: number } = {}
): Promise<TopicDiscussionData[]> {
  const { limit = 20, offset = 0 } = options

  const discussions = await prisma.topicDiscussion.findMany({
    where: {
      status: { in: ['opening', 'active'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })

  return Promise.all(discussions.map(buildDiscussionData))
}

/**
 * Get discussion by ID with participants
 */
export async function getDiscussionWithParticipants(
  discussionId: string
): Promise<DiscussionWithParticipants | null> {
  const discussion = await prisma.topicDiscussion.findUnique({
    where: { id: discussionId },
    include: {
      participants: {
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!discussion) {
    return null
  }

  // Get participant agent info
  const agentIds = discussion.participants.map((p) => p.agentId)
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      source: true,
    },
  })

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  return {
    id: discussion.id,
    zhihuTopicId: discussion.zhihuTopicId,
    title: discussion.title,
    excerpt: discussion.excerpt,
    heat: discussion.heat,
    hostAgentId: discussion.hostAgentId,
    status: discussion.status as DiscussionStatus,
    maxParticipants: discussion.maxParticipants,
    participantCount: discussion.participants.length,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
    participants: discussion.participants.map((p) => {
      const agent = agentMap.get(p.agentId)
      return {
        agentId: p.agentId,
        displayName: agent?.displayName || '未知',
        avatarUrl: agent?.avatarUrl || null,
        source: agent?.source || 'seed',
        isHost: p.isHost,
        joinedAt: p.joinedAt,
      }
    }),
  }
}

/**
 * Get discussions for an agent
 */
export async function getDiscussionsForAgent(
  agentId: string
): Promise<TopicDiscussionData[]> {
  const participations = await prisma.discussionParticipant.findMany({
    where: { agentId },
    select: { discussionId: true },
  })

  const discussionIds = participations.map((p) => p.discussionId)

  if (discussionIds.length === 0) {
    return []
  }

  const discussions = await prisma.topicDiscussion.findMany({
    where: {
      id: { in: discussionIds },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return Promise.all(discussions.map(buildDiscussionData))
}

// Helper to build discussion data with participant count
async function buildDiscussionData(
  discussion: { id: string } | string
): Promise<TopicDiscussionData> {
  const id = typeof discussion === 'string' ? discussion : discussion.id

  const full = await prisma.topicDiscussion.findUnique({
    where: { id },
    include: {
      participants: true,
    },
  })

  if (!full) {
    throw new Error('Discussion not found')
  }

  return {
    id: full.id,
    zhihuTopicId: full.zhihuTopicId,
    title: full.title,
    excerpt: full.excerpt,
    heat: full.heat,
    hostAgentId: full.hostAgentId,
    status: full.status as DiscussionStatus,
    maxParticipants: full.maxParticipants,
    participantCount: full.participants.length,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  }
}
