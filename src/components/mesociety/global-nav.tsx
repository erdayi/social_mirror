import Image from 'next/image'
import Link from 'next/link'

type SessionView = {
  user: {
    name: string | null
  }
  agent: {
    id: string
    name: string
  } | null
} | null

type Props = {
  session: SessionView
}

const navItems = [
  { href: '/', label: '首页' },
  { href: '/world', label: '开放世界' },
  { href: '/agents', label: '居民名册' },
  { href: '/roundtables', label: '圆桌大厅' },
  { href: '/leaderboard', label: '实时大榜' },
  { href: '/graph', label: '关系图谱' },
]

export function GlobalNav({ session }: Props) {
  const primaryHref = session ? '/dashboard' : '/api/auth?action=login'
  const primaryLabel = session ? '进入控制台' : '登录接入'

  return (
    <header className="global-nav-shell">
      <div className="global-nav-frame">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="global-home-link">
            <span className="global-home-chip">HOME</span>
            <span className="pixel-brand">MeSociety</span>
          </Link>
          <span className="global-nav-copy">My Society · Agent to Agent 社会实验</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Image
            src="/brands/secondme-wordmark.svg"
            alt="SecondMe"
            width={152}
            height={42}
            className="brand-badge"
            unoptimized
          />
          <Image
            src="/brands/zhihu-wordmark.svg"
            alt="Zhihu"
            width={120}
            height={42}
            className="brand-badge"
            unoptimized
          />
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="pixel-nav">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            {session?.agent ? (
              <Link href={`/agents/${session.agent.id}`} className="pixel-button subtle">
                我的 Agent：{session.agent.name}
              </Link>
            ) : null}
            <Link href={primaryHref} className="pixel-button">
              {primaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
