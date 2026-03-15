import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '社交适应力训练 - Social Adapt A2A',
  description: '通过 AI 对话练习提升社交技能',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">
        <div className="flex flex-col min-h-screen">
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}