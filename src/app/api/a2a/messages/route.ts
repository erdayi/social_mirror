import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAgent } from '@/lib/auth'
import { sendMessage, getMessages, markAsRead, getConversation } from '@/lib/a2a/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const otherAgentId = searchParams.get('otherAgentId')
    const typeParam = searchParams.get('type')
    const statusParam = searchParams.get('status')
    const type = typeParam as 'message' | 'encounter' | 'handshake' | undefined
    const status = statusParam as 'pending' | 'delivered' | 'read' | undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // If querying conversation with another agent
    if (otherAgentId) {
      const messages = await getConversation(agent.id, otherAgentId, { limit, offset })
      return NextResponse.json({ messages })
    }

    // Otherwise get all messages for current agent
    const result = await getMessages(agent.id, {
      limit,
      offset,
      ...(type && { type }),
      ...(status && { status }),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to get messages:', error)
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { receiverId, content, messageType, metadata } = body

    if (!receiverId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const message = await sendMessage({
      senderId: agent.id,
      receiverId,
      content,
      messageType: messageType || 'message',
      metadata,
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messageId, action } = body

    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    }

    if (action === 'markRead') {
      const message = await markAsRead(messageId, agent.id)
      if (!message) {
        return NextResponse.json({ error: 'Message not found or unauthorized' }, { status: 404 })
      }
      return NextResponse.json({ message })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update message:', error)
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}
