import { NextRequest, NextResponse } from 'next/server'
import { getAgentDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const detail = await getAgentDetailView(context.params.id)

  if (!detail) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  return NextResponse.json({ detail })
}
