import { NextResponse } from 'next/server'
import { ensureAutoSimulationRunner } from '@/lib/mesociety/runner'
import { getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureAutoSimulationRunner()
  return NextResponse.json({
    world: await getWorldStateView({ forceFresh: true }),
  })
}
