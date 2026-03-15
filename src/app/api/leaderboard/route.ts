import { NextResponse } from 'next/server'
import { getLeaderboardView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    leaderboard: await getLeaderboardView(),
  })
}
