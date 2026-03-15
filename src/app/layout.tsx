import type { Metadata } from 'next'
import './globals.css'
import { RootShell } from '@/components/mesociety/root-shell'
import { getCurrentUser } from '@/lib/auth'
import { ensureAutoSimulationRunner } from '@/lib/mesociety/runner'
import { getSessionView } from '@/lib/mesociety/simulation'

export const metadata: Metadata = {
  title: 'MeSociety | 分身社会',
  description: '基于 SecondMe 与知乎能力预留的 A2A 像素社会实验平台。',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await ensureAutoSimulationRunner()
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
