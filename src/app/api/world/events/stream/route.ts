import { env } from '@/lib/env'
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
  ].join(':')
}

export async function GET() {
  let tickTimer: NodeJS.Timeout | undefined
  let keepAliveTimer: NodeJS.Timeout | undefined
  let sending = false
  let lastSignature = ''

  const stream = new ReadableStream({
    async start(controller) {
      const sendWorld = async (force = false) => {
        const world = await getWorldStateView()
        const nextSignature = getWorldSignature(world)
        if (!force && nextSignature === lastSignature) {
          return
        }

        lastSignature = nextSignature
        controller.enqueue(
          encoder.encode(`event: world\ndata: ${JSON.stringify(world)}\n\n`)
        )
      }

      const close = () => {
        if (tickTimer) {
          clearInterval(tickTimer)
        }

        if (keepAliveTimer) {
          clearInterval(keepAliveTimer)
        }
      }

      await sendWorld(true)

      tickTimer = setInterval(async () => {
        if (sending) {
          return
        }

        sending = true
        try {
          await sendWorld()
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: 'world stream failed', error: String(error) })}\n\n`
            )
          )
        } finally {
          sending = false
        }
      }, Math.max(4_000, Math.floor(env.simulation.tickIntervalMs / 2)))

      keepAliveTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
      }, 10_000)

      return close
    },
    cancel() {
      if (tickTimer) {
        clearInterval(tickTimer)
      }

      if (keepAliveTimer) {
        clearInterval(keepAliveTimer)
      }
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
