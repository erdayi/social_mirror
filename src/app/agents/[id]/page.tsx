import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getAgentDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const detail = await getAgentDetailView(params.id)

  if (!detail) {
    notFound()
  }

  const interests = Object.values(detail.agent.snapshot?.interests || {}).flatMap((value) =>
    Array.isArray(value) ? value : []
  )

  return (
    <SiteFrame
      eyebrow="Agent 档案"
      title={detail.agent.name}
      description="查看这个 Agent 的画像、最近关系、历史事件和最新分数。"
    >
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="world-card p-5">
            <p className="pixel-label text-emerald-700">人格快照</p>
            <div className="mt-4 flex items-center gap-4">
              <AgentPortrait src={detail.agent.portraitPath} alt={detail.agent.name} size="lg" />
              <div>
                <p className="text-lg font-semibold text-slate-900">{detail.agent.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.agent.source === 'real' ? '真实 Agent' : '种子 Agent'} · {detail.agent.zone}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">{detail.agent.bio || '暂无公开简介。'}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {interests.slice(0, 8).map((interest) => (
                <span key={String(interest)} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {String(interest)}
                </span>
              ))}
            </div>
            {detail.latestScore ? (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="metric-card compact">
                  <span className="metric-value">{detail.latestScore.totalScore.toFixed(1)}</span>
                  <span className="metric-label">综合分</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{detail.latestScore.rank}</span>
                  <span className="metric-label">当前排名</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="world-card p-5">
            <div className="flex items-center justify-between">
              <p className="pixel-label text-sky-700">最近关系</p>
              <Link href="/graph" className="pixel-link">
                打开图谱
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {detail.relationships.map((relationship) => (
                <div key={relationship.id} className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {relationship.sourceName} → {relationship.targetName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {relationship.type} · 强度 {relationship.strength.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="world-card p-5">
          <p className="pixel-label text-amber-700">最近事件</p>
          <div className="mt-4 space-y-3">
            {detail.recentEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{event.type}</span>
                  <span>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{event.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
