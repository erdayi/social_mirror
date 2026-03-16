import type { Metadata } from 'next'
import './globals.css'
import { RootShell } from '@/components/mesociety/root-shell'
import { getCurrentUser } from '@/lib/auth'
import { ensureAutoSimulationRunner } from '@/lib/mesociety/runner'
import { getSessionView } from '@/lib/mesociety/simulation'

export const metadata: Metadata = {
  title: 'SocialMirror | Agent 实验室',
  description: 'SocialMirror - Agent 实验室，数字分身的社交镜像实验。',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  void ensureAutoSimulationRunner().catch(() => undefined)
  const user = await getCurrentUser()
  const session = await getSessionView(user)

  return (
    <html lang="zh-CN">
      <body>
        <RootShell session={session}>{children}</RootShell>
      </body>
    </html>
  )
}
