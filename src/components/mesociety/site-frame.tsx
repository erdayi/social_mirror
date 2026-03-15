import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'

type Props = {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

const navItems = [
  { href: '/world', label: '开放世界' },
  { href: '/agents', label: '居民名册' },
  { href: '/roundtables', label: '圆桌大厅' },
  { href: '/leaderboard', label: '实时大榜' },
  { href: '/graph', label: '关系图谱' },
]

export function SiteFrame({ eyebrow, title, description, actions, children }: Props) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,252,240,1),_rgba(224,245,226,0.96)_40%,_rgba(196,227,205,0.95))] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="world-card stardew-header mb-8 overflow-hidden">
          <div className="relative h-28 overflow-hidden border-b border-emerald-200/80">
            <Image
              src="/stardew/buildings/houses.png"
              alt="Stardew style town"
              fill
              className="object-cover object-center opacity-90"
              unoptimized
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,250,240,0.15),rgba(255,250,240,0.72))]" />
          </div>
          <div className="flex flex-col gap-6 border-b border-emerald-200/80 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href="/" className="pixel-brand">
                MeSociety
              </Link>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/world" className="pixel-button subtle">
                进入世界
              </Link>
              <Link href="/api/auth?action=login" className="pixel-button">
                SecondMe 登录
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="pixel-label text-emerald-700">{eyebrow}</p>
              <h1 className="pixel-title mt-2 text-2xl text-slate-950 md:text-3xl">{title}</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-sm text-slate-700 transition hover:border-emerald-400">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          {actions ? <div className="px-5 pb-5">{actions}</div> : null}
        </header>

        {children}
      </div>
    </div>
  )
}
