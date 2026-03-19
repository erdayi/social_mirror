import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAgent } from '@/lib/auth'
import {
  getAvailableZhihuTopics,
  getActiveDiscussions,
  getDiscussionsForAgent,
  createDiscussion,
  joinDiscussion,
  leaveDiscussion,
  getDiscussionWithParticipants,
} from '@/lib/a2a/discussion'

// GET /api/a2a/discussions - Get available topics and discussions
export async function GET(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')
    const discussionId = searchParams.get('discussionId')

    // Get available Zhihu topics
    if (action === 'topics') {
      const topics = await getAvailableZhihuTopics()
      return NextResponse.json({ topics })
    }

    // Get specific discussion with participants
    if (action === 'detail' && discussionId) {
      const discussion = await getDiscussionWithParticipants(discussionId)
      if (!discussion) {
        return NextResponse.json({ error: 'Discussion not found' }, { status: 404 })
      }
      return NextResponse.json({ discussion })
    }

    // Get discussions for current agent
    if (agent) {
      const discussions = await getDiscussionsForAgent(agent.id)
      return NextResponse.json({ discussions })
    }

    // Get all active discussions
    const discussions = await getActiveDiscussions({ limit: 20 })
    return NextResponse.json({ discussions })
  } catch (error) {
    console.error('Failed to get discussions:', error)
    return NextResponse.json({ error: 'Failed to get discussions' }, { status: 500 })
  }
}

// POST /api/a2a/discussions - Create or join a discussion
export async function POST(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, discussionId, topic } = body

    if (action === 'create' && topic) {
      // Create new discussion
      const discussion = await createDiscussion(agent.id, {
        zhihuTopicId: topic.id,
        title: topic.title,
        excerpt: topic.excerpt,
        heat: topic.heat,
      })
      return NextResponse.json({ discussion })
    }

    if (action === 'join' && discussionId) {
      // Join existing discussion
      const discussion = await joinDiscussion(discussionId, agent.id)
      if (!discussion) {
        return NextResponse.json({ error: 'Discussion not found' }, { status: 404 })
      }
      return NextResponse.json({ discussion })
    }

    if (action === 'leave' && discussionId) {
      // Leave discussion
      const success = await leaveDiscussion(discussionId, agent.id)
      return NextResponse.json({ success })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to manage discussion:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to manage discussion' },
      { status: 500 }
    )
  }
}
