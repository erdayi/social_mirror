import Link from 'next/link'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import type { RoundtableSummary, WorldStateView } from '@/lib/mesociety/types'

type Props = {
  world: WorldStateView
  roundtables: RoundtableSummary[]
}

const stageMeta: Record<
  string,
  { label: string; classes: string }
> = {
  match: { label: '匹配', classes: 'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]' },
  invite: { label: '邀请', classes: 'bg-[rgba(220,233,255,0.92)] text-[#435c86] border-[rgba(92,112,176,0.2)]' },
  opening: { label: '开场', classes: 'bg-[rgba(255,232,193,0.94)] text-[#8b5728] border-[rgba(156,109,52,0.2)]' },
  responses: { label: '回应', classes: 'bg-[rgba(245,224,255,0.92)] text-[#6b4e95] border-[rgba(125,100,174,0.2)]' },
  summary: { label: '总结', classes: 'bg-[rgba(232,227,255,0.92)] text-[#5c54a4] border-[rgba(98,91,170,0.2)]' },
  relationship_update: { label: '关系更新', classes: 'bg-[rgba(255,225,229,0.92)] text-[#995267] border-[rgba(167,98,122,0.2)]' },
  completed: { label: '已完成', classes: 'bg-[rgba(41,30,60,0.94)] text-[rgba(249,233,199,0.72)] border-[rgba(126,113,186,0.24)]' },
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
          <p className="pixel-label text-[#72e7ff]">正在进行</p>
          <h2 className="pixel-title mt-2 text-lg text-[#ffe9ae]">当前活跃圆桌</h2>

          {active ? (
            <div className="mt-4 rounded-[22px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <WorldAgentSprite
                    name={active.hostName}
                    pixelRole={active.hostPixelRole}
                    pixelPalette={active.hostPixelPalette}
                    source={active.participants.find((participant) => participant.id === active.hostId)?.source || 'seed'}
                    showPlate={false}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#ffe9ae]">{active.topic}</p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      主持：{active.hostName} · 阶段：{active.status}
                    </p>
                  </div>
                </div>
                <StageBadge stage={active.status} />
              </div>
              <div className="mt-4">
                <RoundtableScene roundtable={active} />
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                {active.summary || '圆桌正在推进中，等待更多回合内容出现。'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {active.participants.slice(0, 6).map((participant) => (
                  <span key={participant.id} className="pixel-inline-badge">
                    {participant.name}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <Link href={`/roundtables/${active.id}`} className="pixel-link">
                  打开这场圆桌
                </Link>
              </div>
            </div>
          ) : (
            <p className="pixel-empty mt-4">
              当前没有活跃圆桌。下一轮 tick 可能会自动生成新的讨论。
            </p>
          )}
        </div>

        <div className="world-card p-5">
          <p className="pixel-label text-[#72e7ff]">圆桌机制</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.72)]">
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
        <div className="flex flex-col gap-3 border-b border-[rgba(126,113,186,0.18)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="pixel-label text-[#72e7ff]">历史记录</p>
            <h3 className="pixel-title mt-2 text-lg text-[#ffe9ae]">最近圆桌</h3>
          </div>
          <div className="text-xs font-semibold text-[rgba(249,233,199,0.72)]">
            共展示 {roundtables.length} 场
          </div>
        </div>

        <div className="divide-y divide-[rgba(124,81,41,0.1)]">
          {roundtables.map((roundtable) => (
            <Link
              key={roundtable.id}
              href={`/roundtables/${roundtable.id}`}
              className="block px-5 py-4 transition hover:bg-[rgba(255,241,210,0.74)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <WorldAgentSprite
                    name={roundtable.hostName}
                    pixelRole={roundtable.hostPixelRole}
                    pixelPalette={roundtable.hostPixelPalette}
                    source={roundtable.participants.find((participant) => participant.id === roundtable.hostId)?.source || 'seed'}
                    showPlate={false}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#ffe9ae]">{roundtable.topic}</p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      主持：{roundtable.hostName} · 参与者 {roundtable.participants.length} 名
                    </p>
                  </div>
                </div>
                <StageBadge stage={roundtable.status} />
              </div>

              <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                {roundtable.summary || '圆桌尚未生成总结，等待进入 summary 阶段。'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {roundtable.participants.slice(0, 5).map((participant) => (
                  <span key={participant.id} className="pixel-inline-badge">
                    {participant.name}
                  </span>
                ))}
                {roundtable.participants.length > 5 ? (
                  <span className="pixel-inline-badge">
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
