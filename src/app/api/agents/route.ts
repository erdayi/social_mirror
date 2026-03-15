import { NextResponse } from 'next/server'
import { getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const world = await getWorldStateView()
  return NextResponse.json({
    agents: world.agents,
  })
}
