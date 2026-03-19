import { prisma } from '@/lib/prisma'
import { ingestAgentMemoryEvent, getValidAccessToken } from '@/lib/secondme'
import type { User, Agent, Prisma } from '@prisma/client'

export type A2AMessageType = 'message' | 'encounter' | 'handshake'
export type A2AMessageStatus = 'pending' | 'delivered' | 'read'

export interface A2AMessageData {
  id: string
  senderId: string
  receiverId: string
  content: string
  messageType: A2AMessageType
  status: A2AMessageStatus
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface SendMessageInput {
  senderId: string
  receiverId: string
  content: string
  messageType?: A2AMessageType
  metadata?: Prisma.InputJsonValue
}

export interface DiscoverAgent {
  id: string
  displayName: string
  bio?: string | null
  avatarUrl?: string | null
  slug: string
  style: string
  stance: string
  influence: number
}

/**
 * Send a message from one agent to another
 */
export async function sendMessage(input: SendMessageInput): Promise<A2AMessageData> {
  const { senderId, receiverId, content, messageType = 'message', metadata } = input

  // Create message in database
  const message = await prisma.a2AMessage.create({
    data: {
      senderId,
      receiverId,
      content,
      messageType,
      status: 'pending',
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  })

  // Try to ingest to SecondMe memory system (optional, don't fail if this fails)
  try {
    const sender = await prisma.agent.findUnique({
      where: { id: senderId },
      include: { user: true },
    })

    if (sender?.user) {
      const accessToken = await getValidAccessToken(sender.user)
      await ingestAgentMemoryEvent({
        accessToken,
        event: {
          channel: {
            kind: 'a2a_message',
            id: message.id,
          },
          action: 'send_message',
          refs: [
            {
              objectType: 'agent',
              objectId: receiverId,
            },
          ],
          actionLabel: '发送消息',
          displayText: `向 ${receiverId} 发送消息: ${content.substring(0, 50)}...`,
          eventDesc: `Agent ${senderId} 向 ${receiverId} 发送了 A2A 消息`,
          eventTime: Date.now(),
          importance: 5,
        },
      })
    }
  } catch (error) {
    console.warn('Failed to ingest A2A message to SecondMe:', error)
  }

  return {
    id: message.id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    content: message.content,
    messageType: message.messageType as A2AMessageType,
    status: message.status as A2AMessageStatus,
    metadata: message.metadata as Record<string, unknown> | undefined,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

/**
 * Get messages for an agent (sent or received)
 */
export async function getMessages(
  agentId: string,
  options: {
    limit?: number
    offset?: number
    type?: A2AMessageType
    status?: A2AMessageStatus
  } = {}
): Promise<{ messages: A2AMessageData[]; total: number }> {
  const { limit = 50, offset = 0, type, status } = options

  const where = {
    OR: [{ senderId: agentId }, { receiverId: agentId }],
    ...(type && { messageType: type }),
    ...(status && { status }),
  }

  const [messages, total] = await Promise.all([
    prisma.a2AMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.a2AMessage.count({ where }),
  ])

  return {
    messages: messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: msg.content,
      messageType: msg.messageType as A2AMessageType,
      status: msg.status as A2AMessageStatus,
      metadata: msg.metadata as Record<string, unknown> | undefined,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    })),
    total,
  }
}

/**
 * Get conversation between two agents
 */
export async function getConversation(
  agentId1: string,
  agentId2: string,
  options: { limit?: number; offset?: number } = {}
): Promise<A2AMessageData[]> {
  const { limit = 50, offset = 0 } = options

  const messages = await prisma.a2AMessage.findMany({
    where: {
      OR: [
        { senderId: agentId1, receiverId: agentId2 },
        { senderId: agentId2, receiverId: agentId1 },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    skip: offset,
  })

  return messages.map((msg) => ({
    id: msg.id,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    content: msg.content,
    messageType: msg.messageType as A2AMessageType,
    status: msg.status as A2AMessageStatus,
    metadata: msg.metadata as Record<string, unknown> | undefined,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  }))
}

/**
 * Mark message as read
 */
export async function markAsRead(messageId: string, agentId: string): Promise<A2AMessageData | null> {
  const message = await prisma.a2AMessage.findUnique({
    where: { id: messageId },
  })

  if (!message || message.receiverId !== agentId) {
    return null
  }

  const updated = await prisma.a2AMessage.update({
    where: { id: messageId },
    data: { status: 'read' },
  })

  return {
    id: updated.id,
    senderId: updated.senderId,
    receiverId: updated.receiverId,
    content: updated.content,
    messageType: updated.messageType as A2AMessageType,
    status: updated.status as A2AMessageStatus,
    metadata: updated.metadata as Record<string, unknown> | undefined,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Discover other real agents (excluding current agent)
 */
export async function discoverAgents(
  currentAgentId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<DiscoverAgent[]> {
  const { limit = 20, offset = 0 } = options

  // Find real agents (not seed agents)
  const agents = await prisma.agent.findMany({
    where: {
      id: { not: currentAgentId },
      source: 'real',
      status: 'active',
    },
    select: {
      id: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      slug: true,
      style: true,
      stance: true,
      influence: true,
    },
    orderBy: { influence: 'desc' },
    take: limit,
    skip: offset,
  })

  return agents
}

/**
 * Get unread message count for an agent
 */
export async function getUnreadCount(agentId: string): Promise<number> {
  return prisma.a2AMessage.count({
    where: {
      receiverId: agentId,
      status: { not: 'read' },
    },
  })
}

/**
 * Get latest message timestamp for SSE
 */
export async function getLatestMessageTimestamp(agentId: string): Promise<number> {
  const latest = await prisma.a2AMessage.findFirst({
    where: {
      OR: [{ senderId: agentId }, { receiverId: agentId }],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  return latest?.createdAt.getTime() || 0
}

/**
 * Get agent by ID with user info
 */
export async function getAgentWithUser(agentId: string): Promise<(Agent & { user: User | null }) | null> {
  return prisma.agent.findUnique({
    where: { id: agentId },
    include: { user: true },
  })
}
