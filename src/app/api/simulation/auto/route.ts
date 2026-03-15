import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { env } from '@/lib/env'
import { maybeRunSimulationTick } from '@/lib/mesociety/simulation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RunnerState = {
  enabled: boolean
  startedAt: string | null
  intervalMs: number
  lastError: string | null
  timer: NodeJS.Timeout | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mesocietyAutoRunner: RunnerState | undefined
}

function getRunnerState(): RunnerState {
  if (!globalThis.__mesocietyAutoRunner) {
    globalThis.__mesocietyAutoRunner = {
      enabled: false,
      startedAt: null,
      intervalMs: Math.max(4_000, Math.floor(env.simulation.tickIntervalMs / 2)),
      lastError: null,
      timer: null,
    }
  }

  return globalThis.__mesocietyAutoRunner
}

function serializeState(state: RunnerState) {
  return {
    enabled: state.enabled,
    startedAt: state.startedAt,
    intervalMs: state.intervalMs,
    lastError: state.lastError,
  }
}

export async function GET() {
  const state = getRunnerState()
  return NextResponse.json(serializeState(state))
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as null | { enabled?: unknown }
  const enabled = Boolean(body?.enabled)
  const state = getRunnerState()

  if (!enabled) {
    if (state.timer) {
      clearInterval(state.timer)
    }

    state.timer = null
    state.enabled = false
    state.startedAt = null
    state.lastError = null

    return NextResponse.json(serializeState(state))
  }

  if (state.enabled && state.timer) {
    return NextResponse.json(serializeState(state))
  }

  state.enabled = true
  state.startedAt = new Date().toISOString()
  state.lastError = null
  state.intervalMs = Math.max(4_000, Math.floor(env.simulation.tickIntervalMs / 2))

  const tick = async () => {
    try {
      await maybeRunSimulationTick()
    } catch (error) {
      state.lastError = String(error)
    }
  }

  void tick()
  state.timer = setInterval(() => {
    void tick()
  }, state.intervalMs)

  return NextResponse.json(serializeState(state))
}

