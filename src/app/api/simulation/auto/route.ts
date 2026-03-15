import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getAutoSimulationState,
  serializeAutoSimulationState,
  setAutoSimulationEnabled,
} from '@/lib/mesociety/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(serializeAutoSimulationState(getAutoSimulationState()))
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as null | { enabled?: unknown }
  const enabled = Boolean(body?.enabled)
  const state = await setAutoSimulationEnabled(enabled)
  return NextResponse.json(serializeAutoSimulationState(state))
}
