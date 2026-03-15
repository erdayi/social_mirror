import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MeSociety | 分身社会',
  description: '基于 SecondMe 与知乎能力预留的 A2A 像素社会实验平台。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
