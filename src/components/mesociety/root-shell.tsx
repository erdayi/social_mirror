'use client'

import { usePathname } from 'next/navigation'
import { GlobalNav } from '@/components/mesociety/global-nav'

type SessionView = {
  user: {
    name: string | null
  }
  agent: {
    id: string
    name: string
  } | null
} | null

export function RootShell({
  children,
  session,
}: {
  children: React.ReactNode
  session: SessionView
}) {
  const pathname = usePathname()
  const hideNav = pathname === '/login'

  return (
    <>
      {hideNav ? null : <GlobalNav session={session} />}
      <main>{children}</main>
    </>
  )
}
