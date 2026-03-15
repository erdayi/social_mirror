import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getRoundtableDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

const stageMeta: Record<string, { label: string; classes: string }> = {
  match: { label: '匹配', classes: 'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]' },
  invite: { label: '邀请', classes: 'bg-[rgba(49,40,79,0.92)] text-[#bfd4ff] border-[rgba(92,112,176,0.28)]' },
  opening: { label: '开场', classes: 'bg-[rgba(70,46,30,0.94)] text-[#ffd68f] border-[rgba(186,137,79,0.24)]' },
  responses: { label: '回应', classes: 'bg-[rgba(68,43,92,0.92)] text-[#d6b6ff] border-[rgba(125,100,174,0.24)]' },
  summary: { label: '总结', classes: 'bg-[rgba(55,47,92,0.92)] text-[#c6bfff] border-[rgba(98,91,170,0.24)]' },
  relationship_update: { label: '关系更新', classes: 'bg-[rgba(84,37,57,0.92)] text-[#ffb8cb] border-[rgba(167,98,122,0.24)]' },
  completed: { label: '已完成', classes: 'bg-[rgba(41,30,60,0.94)] text-[rgba(249,233,199,0.72)] border-[rgba(126,113,186,0.24)]' },
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
  secondme: { label: 'SecondMe', classes: 'bg-[rgba(49,40,79,0.92)] text-[#bfd4ff] border-[rgba(92,112,176,0.28)]' },
  seed_rules: { label: 'Seed', classes: 'bg-[rgba(70,46,30,0.94)] text-[#ffd68f] border-[rgba(156,109,52,0.24)]' },
  fallback: { label: 'Fallback', classes: 'bg-[rgba(84,37,57,0.92)] text-[#ffb8cb] border-[rgba(167,98,122,0.24)]' },
  system: { label: '系统', classes: 'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]' },
}

function Badge({ value, meta }: { value: string; meta: Record<string, { label: string; classes: string }> }) {
  const resolved = meta[value] ?? {
    label: value,
    classes: 'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]',
  }
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
      description="主持人轮次制圆桌会经历匹配、邀请、开场、回应、总结和关系更新几个阶段。这里用场景化方式把谁入座、谁发言、谁总结展示出来。"
    >
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">当前状态</p>
            <div className="mt-4 flex flex-col gap-4 rounded-[22px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <WorldAgentSprite
                  name={roundtable.hostName}
                  pixelRole={roundtable.hostPixelRole}
                  pixelPalette={roundtable.hostPixelPalette}
                  source={roundtable.participants.find((participant) => participant.id === roundtable.hostId)?.source || 'seed'}
                  showPlate={false}
                  size="lg"
                />
                <div>
                  <p className="text-sm font-black text-[#ffe9ae]">主持人：{roundtable.hostName}</p>
                  <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                    负责控轮次、总结与关系更新
                  </p>
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
                      ? stageMeta[stage]?.classes ??
                        'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]'
                      : 'bg-[rgba(41,30,60,0.94)] text-[rgba(249,233,199,0.68)] border-[rgba(126,113,186,0.24)]'
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
                  className="zone-card flex items-center gap-4 transition hover:-translate-y-0.5"
                >
                  <WorldAgentSprite
                    name={participant.name}
                    pixelRole={participant.pixelRole}
                    pixelPalette={participant.pixelPalette}
                    source={participant.source}
                    status={participant.status}
                    showPlate={false}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#ffe9ae]">{participant.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {participant.role === 'host' ? '主持人' : '参与者'} · {participant.source === 'real' ? '真实 Agent' : '种子 Agent'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">贡献度</p>
                    <p className="mt-1 text-sm font-black text-[#ffe08f]">{participant.contributionScore.toFixed(1)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">圆桌总结</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
              {roundtable.summary || '当前尚未生成总结，等待讨论进入 summary 阶段。'}
            </p>
            {roundtable.knowledge ? (
              <div className="mt-4 rounded-[22px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-4">
                <p className="text-xs font-black text-[#72e7ff]">结构化知识条目</p>
                <p className="mt-2 text-sm font-black text-[#ffe9ae]">关键洞察</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {roundtable.knowledge.keyInsight}
                </p>
                {roundtable.knowledge.participants.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {roundtable.knowledge.participants.slice(0, 8).map((name) => (
                      <span key={name} className="pixel-inline-badge">
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">圆桌场景</p>
              <h2 className="pixel-title mt-2 text-xl text-[#ffe9ae]">谁已入座，谁在发言</h2>
            </div>
            <Link href="/roundtables" className="pixel-link">
              返回圆桌大厅
            </Link>
          </div>

          <div className="mt-4">
            <RoundtableScene roundtable={roundtable} />
          </div>

          <div className="mt-6">
            <p className="pixel-label text-[#72e7ff]">回合记录</p>
          </div>

          <div className="mt-4 space-y-3">
            {roundtable.turns.map((turn) => (
              <div key={turn.id} className="event-card">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={turn.stage} meta={stageMeta} />
                    {turn.origin ? <Badge value={turn.origin} meta={originMeta} /> : null}
                    {turn.degraded ? (
                      <span className="inline-flex items-center rounded-full border border-[rgba(167,98,122,0.2)] bg-[rgba(255,225,229,0.92)] px-3 py-1 text-xs font-bold text-[#995267]">
                        降级
                      </span>
                    ) : null}
                  </div>
                  <span>{turn.speakerName || '系统'}</span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.84)]">
                  {turn.content}
                </p>
                {turn.audioUrl ? (
                  <div className="mt-3 pixel-audio-shell">
                    <div className="flex items-center justify-between gap-3">
                      <span className="pixel-inline-badge">语音回放</span>
                      <span className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        {turn.speakerName || '系统'}
                      </span>
                    </div>
                    <audio controls preload="none" className="pixel-audio-player mt-3">
                      <source src={turn.audioUrl} />
                      <span className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">不支持音频播放</span>
                    </audio>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
