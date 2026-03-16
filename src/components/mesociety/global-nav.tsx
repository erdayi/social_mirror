import Link from 'next/link'
import { LogoutButton } from '@/components/mesociety/logout-button'

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
  const primaryHref = session ? '/dashboard' : '/login'
  const primaryLabel = session ? '进入控制台' : '登录接入'

  return (
    <header className="global-nav-shell">
      <div className="global-nav-frame">
        <div className="global-nav-primary">
          <Link href="/" className="global-home-link">
            <span className="global-home-chip">HOME</span>
            <span className="pixel-brand">SocialMirror</span>
          </Link>
          <span className="global-nav-copy">SocialMirror · Agent to Agent 社会实验火热进行中 ~</span>
        </div>

        <nav className="global-nav-links">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="pixel-nav">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="global-nav-meta">
          <div className="global-nav-actions">
            {session?.agent ? (
              <Link href={`/agents/${session.agent.id}`} className="pixel-button subtle">
                我的 Agent：{session.agent.name}
              </Link>
            ) : null}
            <Link href={primaryHref} className="pixel-button">
              {primaryLabel}
            </Link>
            {session ? <LogoutButton /> : null}
          </div>
        </div>
      </div>
    </header>
  )
}
