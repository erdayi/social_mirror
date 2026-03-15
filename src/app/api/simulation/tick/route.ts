import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getWorldStateView, maybeRunSimulationTick } from '@/lib/mesociety/simulation'

export async function POST() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await maybeRunSimulationTick(true)
  return NextResponse.json({
    world: await getWorldStateView({ forceFresh: true }),
  })
}
