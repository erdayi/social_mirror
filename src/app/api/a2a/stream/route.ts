import { getCurrentAgent } from '@/lib/auth'
import { getLatestMessageTimestamp, getUnreadCount } from '@/lib/a2a/service'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const encoder = new TextEncoder()

async function* messageStreamGenerator(agentId: string) {
  let lastTimestamp = await getLatestMessageTimestamp(agentId)
  let lastUnreadCount = await getUnreadCount(agentId)

  // Send initial state
  yield encoder.encode(
    `event: init\ndata: ${JSON.stringify({ timestamp: lastTimestamp, unreadCount: lastUnreadCount })}\n\n`
  )

  // Poll for changes
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 3_000))

    const currentTimestamp = await getLatestMessageTimestamp(agentId)
    const currentUnreadCount = await getUnreadCount(agentId)

    // Check for new messages
    if (currentTimestamp > lastTimestamp) {
      // Get the new messages
      const newMessages = await prisma.a2AMessage.findMany({
        where: {
          OR: [{ senderId: agentId }, { receiverId: agentId }],
          createdAt: { gt: new Date(lastTimestamp) },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })

      if (newMessages.length > 0) {
        yield encoder.encode(
          `event: new_messages\ndata: ${JSON.stringify({ messages: newMessages })}\n\n`
        )
      }

      lastTimestamp = currentTimestamp
    }

    // Check for unread count changes
    if (currentUnreadCount !== lastUnreadCount) {
      yield encoder.encode(
        `event: unread_count\ndata: ${JSON.stringify({ unreadCount: currentUnreadCount })}\n\n`
      )
      lastUnreadCount = currentUnreadCount
    }

    // Send keep-alive periodically
    yield encoder.encode(': keep-alive\n\n')
  }
}

export async function GET() {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return new Response('Unauthorized', { status: 401 })
    }

    const iterator = messageStreamGenerator(agent.id)
    const stream = new ReadableStream({
      async pull(controller) {
        const { value, done } = await iterator.next()
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      },
      cancel() {
        iterator.return?.()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('A2A stream error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
