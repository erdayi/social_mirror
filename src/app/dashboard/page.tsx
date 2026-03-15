import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  MessageCircle,
  TrendingUp,
  BookOpen,
  Users,
  LogOut,
} from 'lucide-react'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/api/auth?action=login')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b-2 border-primary-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-pixel text-primary-500 text-lg">社交适应力</h1>
          <div className="flex items-center gap-4">
            <span className="font-cute text-gray-600">
              欢迎，{user.name || '用户'}
            </span>
            <a
              href="/api/auth?action=logout"
              className="flex items-center gap-1 text-gray-500 hover:text-primary-500"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">退出</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="font-pixel text-xl text-primary-600 mb-6">
          选择训练模块
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <ModuleCard
            icon={<MessageCircle className="w-10 h-10 text-primary-400" />}
            title="场景模拟"
            description="在虚拟社交场景中练习对话，获得即时反馈"
            href="/practice"
            color="primary"
          />
          <ModuleCard
            icon={<TrendingUp className="w-10 h-10 text-coral-400" />}
            title="成长记录"
            description="查看您的社交技能进步历程和成就"
            href="/growth"
            color="coral"
          />
          <ModuleCard
            icon={<BookOpen className="w-10 h-10 text-secondary-400" />}
            title="我的笔记"
            description="记录社交心得，获取个性化建议"
            href="/notes"
            color="secondary"
          />
          <ModuleCard
            icon={<Users className="w-10 h-10 text-accent-pink" />}
            title="社区交流"
            description="与其他用户分享经验、互相学习"
            href="/community"
            color="pink"
          />
        </div>
      </main>
    </div>
  )
}

function ModuleCard({
  icon,
  title,
  description,
  href,
  color,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  color: 'primary' | 'coral' | 'secondary' | 'pink'
}) {
  const colorClasses = {
    primary: 'border-primary-200 hover:border-primary-400 hover:bg-primary-50',
    coral: 'border-coral-200 hover:border-coral-400 hover:bg-coral-50',
    secondary: 'border-secondary-200 hover:border-secondary-400 hover:bg-secondary-50',
    pink: 'border-accent-pink hover:border-accent-coral hover:bg-pink-50',
  }

  return (
    <Link
      href={href}
      className={`card-pixel block hover:scale-105 transition-all ${colorClasses[color]}`}
    >
      <div className="flex items-start gap-4">
        <div className="p-2 bg-white rounded-pixel">{icon}</div>
        <div>
          <h3 className="font-cute font-bold text-lg text-gray-800 mb-1">
            {title}
          </h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </Link>
  )
}