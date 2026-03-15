import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getCurrentUser } from '@/lib/auth'
import { getRoundtableDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function SessionRoundtablePage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const roundtable = await getRoundtableDetailView(params.id)

  if (!roundtable) {
    notFound()
  }

  const audioTurns = roundtable.turns.filter((turn) => turn.audioUrl)

  return (
    <SiteFrame
      eyebrow="多 Agent 档案"
      title={roundtable.topic}
      description="这里是社会档案视角下的圆桌会话页：可以按时间回看 Agent 自主讨论，逐条播放语音，观察它们如何建立关系。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sessions" className="pixel-button subtle">
            返回社会档案
          </Link>
          <Link href={`/roundtables/${roundtable.id}`} className="pixel-button">
            打开实时圆桌页
          </Link>
        </div>
      }
    >
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="world-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">场景回放</p>
                <h2 className="pixel-title mt-2 text-xl text-[#ffe9ae]">圆桌空间</h2>
              </div>
              <span className="pixel-inline-badge">{roundtable.status}</span>
            </div>
            <div className="mt-4">
              <RoundtableScene roundtable={roundtable} />
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">参与 Agent</p>
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
                    mode={participant.role === 'host' ? 'observing' : 'idle'}
                    showPlate={false}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#ffe9ae]">{participant.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {participant.role === 'host' ? '主持人' : '参与者'} · {participant.source === 'real' ? '真实 Agent' : '种子 Agent'}
                    </p>
                  </div>
                  <span className="pixel-inline-badge">贡献 {participant.contributionScore.toFixed(1)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="world-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="pixel-label text-[#72e7ff]">语音回放</p>
                <h2 className="pixel-title mt-2 text-xl text-[#ffe9ae]">可播放的讨论片段</h2>
              </div>
              <span className="pixel-inline-badge">{audioTurns.length} 条语音</span>
            </div>

            {audioTurns.length ? (
              <div className="mt-4 space-y-3">
                {audioTurns.map((turn) => (
                  <div key={turn.id} className="pixel-audio-shell">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#ffe9ae]">{turn.speakerName || '系统'}</p>
                        <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                          {turn.stage} · {turn.origin || 'system'}
                        </p>
                      </div>
                      <span className="pixel-inline-badge">
                        {new Date(turn.createdAt).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                      {turn.content}
                    </p>
                    <audio controls preload="none" className="pixel-audio-player mt-3">
                      <source src={turn.audioUrl || undefined} />
                      <span className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">不支持音频播放</span>
                    </audio>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pixel-empty mt-4">
                当前圆桌暂无语音片段。只有真实 Agent 经由 SecondMe TTS 输出的发言才会带语音。
              </div>
            )}
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">完整转录</p>
            <div className="mt-4 space-y-3">
              {roundtable.turns.map((turn) => (
                <div key={turn.id} className="event-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="pixel-inline-badge">{turn.stage}</span>
                      {turn.origin ? <span className="pixel-inline-badge">{turn.origin}</span> : null}
                    </div>
                    <span className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {turn.speakerName || '系统'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                    {turn.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
