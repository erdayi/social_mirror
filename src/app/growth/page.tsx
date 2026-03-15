import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ArrowLeft, Trophy, Target, Star } from 'lucide-react'

export default async function GrowthPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/api/auth?action=login')
  }

  const records = await prisma.growthRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // 计算统计数据
  const totalPractices = records.filter((r) => r.type === 'scenario_practice').length
  const avgScore =
    records
      .filter((r) => r.score !== null)
      .reduce((sum, r) => sum + (r.score || 0), 0) /
      records.filter((r) => r.score !== null).length || 0

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="max-w-4xl mx-auto mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>
        <h1 className="font-pixel text-xl text-primary-600">成长记录</h1>
      </header>

      {/* Stats Cards */}
      <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 mb-8">
        <div className="card-pixel text-center">
          <Target className="w-8 h-8 text-primary-400 mx-auto mb-2" />
          <p className="font-pixel text-2xl text-primary-600">{totalPractices}</p>
          <p className="text-sm text-gray-600 font-cute">练习次数</p>
        </div>
        <div className="card-pixel text-center">
          <Star className="w-8 h-8 text-secondary-400 mx-auto mb-2" />
          <p className="font-pixel text-2xl text-secondary-500">
            {avgScore.toFixed(0)}
          </p>
          <p className="text-sm text-gray-600 font-cute">平均分数</p>
        </div>
        <div className="card-pixel text-center">
          <Trophy className="w-8 h-8 text-coral-400 mx-auto mb-2" />
          <p className="font-pixel text-2xl text-coral-500">
            {records.filter((r) => r.type === 'achievement').length}
          </p>
          <p className="text-sm text-gray-600 font-cute">获得成就</p>
        </div>
      </div>

      {/* Records List */}
      <div className="max-w-4xl mx-auto">
        <h2 className="font-cute font-bold text-lg text-gray-700 mb-4">
          最近记录
        </h2>
        {records.length === 0 ? (
          <div className="card-pixel text-center py-12">
            <p className="text-gray-500 font-cute">还没有记录</p>
            <p className="text-sm text-gray-400 mt-2">
              开始练习后会在这里显示成长记录
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div key={record.id} className="card-cute">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-cute font-bold text-gray-800">
                      {record.title}
                    </h3>
                    <p className="text-sm text-gray-500">{record.scenarioType}</p>
                  </div>
                  {record.score !== null && (
                    <div className="text-right">
                      <span className="font-pixel text-lg text-primary-500">
                        {record.score}
                      </span>
                      <span className="text-sm text-gray-400">分</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}