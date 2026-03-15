import { PixelEarthHero } from '@/components/mesociety/pixel-earth-hero'
import { getCurrentUser } from '@/lib/auth'
import { getSessionView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await getCurrentUser()
  const [world, session] = await Promise.all([
    getWorldStateView(),
    getSessionView(user),
  ])

  return <PixelEarthHero world={world} session={session} />
}
