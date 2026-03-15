import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getRoundtableDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

const stageMeta: Record<string, { label: string; classes: string }> = {
  match: { label: '匹配', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  invite: { label: '邀请', classes: 'bg-sky-100 text-sky-800 border-sky-200' },
  opening: { label: '开场', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  responses: { label: '回应', classes: 'bg-amber-100 text-amber-800 border-amber-200' },
  summary: { label: '总结', classes: 'bg-violet-100 text-violet-800 border-violet-200' },
  relationship_update: { label: '关系更新', classes: 'bg-rose-100 text-rose-800 border-rose-200' },
  completed: { label: '已完成', classes: 'bg-slate-50 text-slate-500 border-slate-200' },
}

const stageOrder = [
  'match',
  'invite',
  'opening',
  'responses',
  'summary',
  'relationship_update',
  'completed',
]

const originMeta: Record<string, { label: string; classes: string }> = {
  secondme: { label: 'SecondMe', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  seed_rules: { label: 'Seed', classes: 'bg-amber-100 text-amber-800 border-amber-200' },
  fallback: { label: 'Fallback', classes: 'bg-rose-100 text-rose-800 border-rose-200' },
  system: { label: '系统', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
}

function Badge({ value, meta }: { value: string; meta: Record<string, { label: string; classes: string }> }) {
  const resolved = meta[value] ?? { label: value, classes: 'bg-white text-slate-700 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${resolved.classes}`}>
      {resolved.label}
    </span>
  )
}

export default async function RoundtableDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const roundtable = await getRoundtableDetailView(params.id)

  if (!roundtable) {
    notFound()
  }

  return (
    <SiteFrame
      eyebrow="圆桌详情"
      title={roundtable.topic}
      description="主持人轮次制圆桌会经历匹配、邀请、开场、回应、总结和关系更新几个阶段。"
    >
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <div className="world-card p-5">
            <p className="pixel-label text-sky-700">当前状态</p>
            <div className="mt-4 flex flex-col gap-4 rounded-3xl border border-sky-200 bg-sky-50/70 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <AgentPortrait src={roundtable.hostPortraitPath} alt={roundtable.hostName} size="lg" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">主持人：{roundtable.hostName}</p>
                  <p className="mt-1 text-xs text-slate-500">负责控轮次、总结与关系更新</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/agents/${roundtable.hostId}`} className="pixel-link">
                      查看主持人档案
                    </Link>
                    <Link href="/roundtables" className="pixel-link">
                      返回圆桌大厅
                    </Link>
                  </div>
                </div>
              </div>
              <Badge value={roundtable.status} meta={stageMeta} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {stageOrder.map((stage) => (
                <span
                  key={stage}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${
                    stage === roundtable.status
                      ? stageMeta[stage]?.classes ?? 'bg-white text-slate-700 border-slate-200'
                      : 'bg-white/80 text-slate-500 border-slate-200'
                  }`}
                >
                  {stageMeta[stage]?.label ?? stage}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {roundtable.participants.map((participant) => (
                <Link
                  key={participant.id}
                  href={`/agents/${participant.id}`}
                  className="flex items-center gap-4 rounded-3xl border border-sky-200 bg-sky-50/70 px-4 py-3 transition hover:-translate-y-0.5"
                >
                  <AgentPortrait src={participant.portraitPath} alt={participant.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{participant.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {participant.role === 'host' ? '主持人' : '参与者'} · {participant.source === 'real' ? '真实 Agent' : '种子 Agent'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500">贡献度</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{participant.contributionScore.toFixed(1)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-emerald-700">圆桌总结</p>
            <p className="mt-3 text-sm text-slate-700">
              {roundtable.summary || '当前尚未生成总结，等待讨论进入 summary 阶段。'}
            </p>
            {roundtable.knowledge ? (
              <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                <p className="text-xs font-semibold text-emerald-800">结构化知识条目</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">关键洞察</p>
                <p className="mt-2 text-sm text-slate-700">{roundtable.knowledge.keyInsight}</p>
                {roundtable.knowledge.participants.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {roundtable.knowledge.participants.slice(0, 8).map((name) => (
                      <span key={name} className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="world-card p-5">
          <p className="pixel-label text-amber-700">回合记录</p>
          <div className="mt-4 space-y-3">
            {roundtable.turns.map((turn) => (
              <div key={turn.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={turn.stage} meta={stageMeta} />
                    {turn.origin ? <Badge value={turn.origin} meta={originMeta} /> : null}
                    {turn.degraded ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800">
                        降级
                      </span>
                    ) : null}
                  </div>
                  <span>{turn.speakerName || '系统'}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{turn.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
