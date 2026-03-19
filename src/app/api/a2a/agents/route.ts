import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAgent } from '@/lib/auth'
import { discoverAgents } from '@/lib/a2a/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const agent = await getCurrentAgent()
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const agents = await discoverAgents(agent.id, { limit, offset })

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Failed to discover agents:', error)
    return NextResponse.json({ error: 'Failed to discover agents' }, { status: 500 })
  }
}
