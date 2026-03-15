import Link from 'next/link'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
import type { RoundtableSummary, WorldStateView } from '@/lib/mesociety/types'

type Props = {
  world: WorldStateView
  roundtables: RoundtableSummary[]
}

const stageMeta: Record<
  string,
  { label: string; classes: string }
> = {
  match: { label: '匹配', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  invite: { label: '邀请', classes: 'bg-sky-100 text-sky-800 border-sky-200' },
  opening: { label: '开场', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  responses: { label: '回应', classes: 'bg-amber-100 text-amber-800 border-amber-200' },
  summary: { label: '总结', classes: 'bg-violet-100 text-violet-800 border-violet-200' },
  relationship_update: { label: '关系更新', classes: 'bg-rose-100 text-rose-800 border-rose-200' },
  completed: { label: '已完成', classes: 'bg-slate-50 text-slate-500 border-slate-200' },
}

function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta[stage] ?? stageMeta.match
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${meta.classes}`}
    >
      {meta.label}
    </span>
  )
}

export function RoundtablesBoard({ world, roundtables }: Props) {
  const active = world.activeRoundtable

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="space-y-6">
        <div className="world-card p-5">
          <p className="pixel-label text-sky-700">正在进行</p>
          <h2 className="pixel-title mt-2 text-lg text-slate-900">当前活跃圆桌</h2>

          {active ? (
            <Link href={`/roundtables/${active.id}`} className="mt-4 block rounded-3xl border border-sky-200 bg-sky-50/70 px-4 py-4 transition hover:-translate-y-0.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <AgentPortrait src={active.hostPortraitPath} alt={active.hostName} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{active.topic}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      主持：{active.hostName} · 阶段：{active.status}
                    </p>
                  </div>
                </div>
                <StageBadge stage={active.status} />
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {active.summary || '圆桌正在推进中，等待更多回合内容出现。'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {active.participants.slice(0, 6).map((participant) => (
                  <span key={participant.id} className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                    {participant.name}
                  </span>
                ))}
              </div>
            </Link>
          ) : (
            <p className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前没有活跃圆桌。下一轮 tick 可能会自动生成新的讨论。
            </p>
          )}
        </div>

        <div className="world-card p-5">
          <p className="pixel-label text-emerald-700">圆桌机制</p>
          <p className="mt-3 text-sm text-slate-600">
            主持 Agent 负责匹配参与者、发出邀请、引导开场与回应，最终生成总结并同步关系边与知识图谱节点。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(stageMeta).map(([stage, meta]) => (
              <span key={stage} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${meta.classes}`}>
                {meta.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="world-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-emerald-200/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="pixel-label text-amber-700">历史记录</p>
            <h3 className="pixel-title mt-2 text-lg text-slate-900">最近圆桌</h3>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            共展示 {roundtables.length} 场
          </div>
        </div>

        <div className="divide-y divide-emerald-100/90">
          {roundtables.map((roundtable) => (
            <Link
              key={roundtable.id}
              href={`/roundtables/${roundtable.id}`}
              className="block px-5 py-4 transition hover:bg-emerald-50/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <AgentPortrait src={roundtable.hostPortraitPath} alt={roundtable.hostName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{roundtable.topic}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      主持：{roundtable.hostName} · 参与者 {roundtable.participants.length} 名
                    </p>
                  </div>
                </div>
                <StageBadge stage={roundtable.status} />
              </div>

              <p className="mt-3 line-clamp-2 text-sm text-slate-700">
                {roundtable.summary || '圆桌尚未生成总结，等待进入 summary 阶段。'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {roundtable.participants.slice(0, 5).map((participant) => (
                  <span key={participant.id} className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                    {participant.name}
                  </span>
                ))}
                {roundtable.participants.length > 5 ? (
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500">
                    +{roundtable.participants.length - 5}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
