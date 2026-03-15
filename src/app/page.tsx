import { PixelEarthHero } from '@/components/mesociety/pixel-earth-hero'
import { getCurrentUser } from '@/lib/auth'
import { getHomeWorldView, getSessionView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await getCurrentUser()
  const [world, session] = await Promise.all([
    getHomeWorldView(),
    getSessionView(user),
  ])

  return <PixelEarthHero world={world} session={session} />
}
