import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
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
  ].join(':')
}

export async function GET() {
  await ensureAutoSimulationRunner()
  let tickTimer: NodeJS.Timeout | undefined
  let keepAliveTimer: NodeJS.Timeout | undefined
  let sending = false
  let lastTickCount = -1
  let lastSignature = ''

  const stream = new ReadableStream({
    async start(controller) {
      const sendWorld = async (force = false) => {
        if (!force) {
          const worldState = await prisma.worldState.findUnique({
            where: { id: 1 },
            select: { tickCount: true },
          })

          if (worldState && worldState.tickCount === lastTickCount) {
            return
          }
        }

        const world = await getWorldStateView()
        const nextSignature = getWorldSignature(world)
        if (!force && nextSignature === lastSignature) {
          return
        }

        lastTickCount = world.tickCount
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
      }, 5_000)

      keepAliveTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'))
      }, 15_000)

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
