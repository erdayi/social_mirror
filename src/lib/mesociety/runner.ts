import { env } from '@/lib/env'
import { maybeRunSimulationTick } from '@/lib/mesociety/simulation'

type RunnerState = {
  enabled: boolean
  startedAt: string | null
  intervalMs: number
  lastError: string | null
  timer: ReturnType<typeof setInterval> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mesocietyAutoRunner: RunnerState | undefined
}

function isBuildPhase() {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

function createInitialState(): RunnerState {
  return {
    enabled: false,
    startedAt: null,
    intervalMs: Math.max(4_000, Math.floor(env.simulation.tickIntervalMs / 2)),
    lastError: null,
    timer: null,
  }
}

export function getAutoSimulationState() {
  if (!globalThis.__mesocietyAutoRunner) {
    globalThis.__mesocietyAutoRunner = createInitialState()
  }

  return globalThis.__mesocietyAutoRunner
}

async function runAutoTick(state: RunnerState) {
  try {
    await maybeRunSimulationTick()
    state.lastError = null
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error)
  }
}

export async function setAutoSimulationEnabled(enabled: boolean) {
  const state = getAutoSimulationState()

  if (isBuildPhase()) {
    return state
  }

  if (!enabled) {
    if (state.timer) {
      clearInterval(state.timer)
    }

    state.timer = null
    state.enabled = false
    state.startedAt = null
    state.lastError = null
    return state
  }

  if (state.enabled && state.timer) {
    return state
  }

  state.enabled = true
  state.startedAt = state.startedAt || new Date().toISOString()
  state.lastError = null
  state.intervalMs = Math.max(4_000, Math.floor(env.simulation.tickIntervalMs / 2))

  await runAutoTick(state)
  state.timer = setInterval(() => {
    void runAutoTick(state)
  }, state.intervalMs)

  return state
}

export async function ensureAutoSimulationRunner() {
  const state = getAutoSimulationState()

  if (!state.enabled || !state.timer) {
    await setAutoSimulationEnabled(true)
  }

  return getAutoSimulationState()
}

export function serializeAutoSimulationState(state = getAutoSimulationState()) {
  return {
    enabled: state.enabled,
    startedAt: state.startedAt,
    intervalMs: state.intervalMs,
    lastError: state.lastError,
  }
}
