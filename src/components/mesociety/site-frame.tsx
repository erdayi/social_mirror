import type { ReactNode } from 'react'
import Link from 'next/link'

type Props = {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

export function SiteFrame({ eyebrow, title, description, actions, children }: Props) {
  return (
    <div className="world-shell">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="world-card mb-8 page-hero">
          <div className="page-hero-head">
            <div>
              <p className="pixel-label text-[#72e7ff]">{eyebrow}</p>
              <h1 className="pixel-title mt-2 text-2xl text-[#ffe9ae] md:text-3xl">{title}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="pixel-nav">
                返回首页
              </Link>
              <Link href="/world" className="pixel-button subtle">
                进入世界
              </Link>
            </div>
          </div>
          {actions ? <div className="px-5 pb-5">{actions}</div> : null}
        </header>

        {children}
      </div>
    </div>
  )
}
