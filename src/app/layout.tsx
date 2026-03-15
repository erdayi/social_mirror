import type { Metadata } from 'next'
import './globals.css'
import { GlobalNav } from '@/components/mesociety/global-nav'
import { getCurrentUser } from '@/lib/auth'
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
  const user = await getCurrentUser()
  const session = await getSessionView(user)

  return (
    <html lang="zh-CN">
      <body>
        <GlobalNav session={session} />
        <main>{children}</main>
      </body>
    </html>
  )
}
