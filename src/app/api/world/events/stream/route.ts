import { prisma } from '@/lib/prisma'
import { buildWorldStreamEvents } from '@/lib/application/world-events'
import { ensureAutoSimulationRunner } from '@/lib/mesociety/runner'
import { getWorldStateView } from '@/lib/mesociety/simulation'
import type { WorldStateView } from '@/lib/mesociety/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const encoder = new TextEncoder()

function getWorldSignature(world: WorldStateView) {
  return [
    world.tickCount,
    world.lastTickAt || 'never',
    world.activeRoundtable?.id || 'none',
    world.activeRoundtable?.turns[world.activeRoundtable.turns.length - 1]?.id || 'none',
    world.recentEvents[0]?.id || 'none',
    world.externalSignals.primaryHotTopic?.title || 'none',
    world.externalSignals.candidateHotTopics.map((item) => item.title).join('|') || 'none',
    world.externalSignals.hotTopics[0]?.id || 'none',
    world.externalSignals.circles[0]?.id || 'none',
  ].join(':')
}

async function* worldEventGenerator() {
  await ensureAutoSimulationRunner()

  let lastTickCount = -1
  let lastSignature = ''
  let previousWorld: WorldStateView | null = null

  const sendWorld = async (force: boolean) => {
    if (!force) {
      const worldState = await prisma.worldState.findUnique({
        where: { id: 1 },
        select: { tickCount: true },
      })

      if (worldState && worldState.tickCount === lastTickCount) {
        return null
      }
    }

    const world = await getWorldStateView({ forceFresh: true })
    const nextSignature = getWorldSignature(world)
    if (!force && nextSignature === lastSignature) {
      return null
    }

    lastTickCount = world.tickCount
    lastSignature = nextSignature

    const messages: string[] = []
    for (const event of buildWorldStreamEvents(previousWorld, world)) {
      messages.push(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`)
    }
    messages.push(`event: world\ndata: ${JSON.stringify(world)}\n\n`)
    previousWorld = world
    return messages.join('')
  }

  // Send initial state
  const initial = await sendWorld(true)
  if (initial) {
    yield encoder.encode(initial)
  }

  // Poll for changes
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5_000))

    const update = await sendWorld(false)
    if (update) {
      yield encoder.encode(update)
    }

    // Send keep-alive periodically
    yield encoder.encode(': keep-alive\n\n')
  }
}

export async function GET() {
  const iterator = worldEventGenerator()
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
    cancel() {
      iterator.return?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
