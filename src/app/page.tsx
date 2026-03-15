import Link from 'next/link'
import { MessageCircle, User, BookOpen, Users } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b-2 border-primary-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-pixel text-primary-500 text-lg">社交适应力</h1>
          <Link
            href="/auth/callback"
            className="btn-cute bg-primary-400 hover:bg-primary-500"
          >
            登录
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-3xl">
          <div className="mb-8">
            <span className="text-6xl">🎮</span>
          </div>
          <h2 className="font-pixel text-2xl md:text-3xl text-primary-600 mb-4">
            社交适应力训练
          </h2>
          <p className="text-lg text-gray-600 mb-8 font-cute">
            通过 AI 对话练习，在安全的虚拟环境中提升社交技能。
            <br />
            获得个性化建议，记录成长轨迹，与社区伙伴一起进步。
          </p>
          <Link
            href="/auth/callback"
            className="btn-pixel text-base inline-block"
          >
            开始训练 →
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <h3 className="font-pixel text-xl text-center text-primary-500 mb-12">
            核心功能
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<MessageCircle className="w-8 h-8 text-primary-400" />}
              title="场景模拟"
              description="在各种社交场景中与 AI 对话练习"
            />
            <FeatureCard
              icon={<User className="w-8 h-8 text-coral-400" />}
              title="个性化建议"
              description="根据您的特点获得专属社交建议"
            />
            <FeatureCard
              icon={<BookOpen className="w-8 h-8 text-secondary-400" />}
              title="成长记录"
              description="追踪您的社交技能进步历程"
            />
            <FeatureCard
              icon={<Users className="w-8 h-8 text-accent-pink" />}
              title="社区交流"
              description="与其他用户分享经验、互相学习"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-100 py-6 px-4 text-center">
        <p className="font-cute text-gray-600">
          Powered by SecondMe AI | 黑客松项目
        </p>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="card-pixel text-center hover:scale-105 transition-transform">
      <div className="flex justify-center mb-3">{icon}</div>
      <h4 className="font-cute font-bold text-gray-800 mb-2">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  )
}