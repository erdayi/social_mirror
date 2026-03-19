import { NextResponse } from 'next/server'
import { getLeaderboardView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const world = await getWorldStateView()

  return NextResponse.json({
    leaderboard: await getLeaderboardView(),
    hotTopic: world.externalSignals.primaryHotTopic ?? null,
  })
}
