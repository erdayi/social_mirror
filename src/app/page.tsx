import { PixelEarthHero } from '@/components/mesociety/pixel-earth-hero'
import { getCurrentUser } from '@/lib/auth'
import { getLandingView, getSessionView } from '@/lib/mesociety/simulation'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }
  const [world, session] = await Promise.all([
    getLandingView(),
    getSessionView(user),
  ])

  return <PixelEarthHero world={world} session={session} />
}
