import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getCurrentUser } from '@/lib/auth'
import { getRoundtableListView } from '@/lib/mesociety/simulation'
import { getSecondMeChatSessions, getValidAccessToken } from '@/lib/secondme'

export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const accessToken = await getValidAccessToken(user)
  let sessions: Array<{
    sessionId: string
    appId: string
    lastMessage: string
    lastUpdateTime: string
    messageCount: number
  }> = []

  try {
    sessions = await getSecondMeChatSessions({
      accessToken,
    })
  } catch {
    // 静默失败
  }

  const roundtables = await getRoundtableListView()
  const sessionMessageTotal = sessions.reduce((sum, session) => sum + session.messageCount, 0)
  const roundtableAudioTotal = roundtables.reduce(
    (sum, roundtable) => sum + roundtable.turns.filter((turn) => turn.audioUrl).length,
    0
  )
  const summarizedRoundtables = roundtables.filter((roundtable) => roundtable.summary).length

  return (
    <SiteFrame
      eyebrow="会话历史"
      title="社会会话与圆桌档案"
      description="这里汇总你的 SecondMe 私聊记录，以及 SocialMirror 中多 Agent 圆桌、语音回放和公共议题档案；后续接入知乎后，会把外部热议一起沉淀到这层记录。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="pixel-button subtle">
            返回控制台
          </Link>
          <Link href="/world" className="pixel-button">
            进入世界观察
          </Link>
        </div>
      }
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card compact">
          <span className="metric-value">{sessions.length}</span>
          <span className="metric-label">私聊会话</span>
        </div>
        <div className="metric-card compact">
          <span className="metric-value">{sessionMessageTotal}</span>
          <span className="metric-label">累计私聊消息</span>
        </div>
        <div className="metric-card compact">
          <span className="metric-value">{roundtableAudioTotal}</span>
          <span className="metric-label">圆桌语音条目</span>
        </div>
        <div className="metric-card compact">
          <span className="metric-value">{summarizedRoundtables}</span>
          <span className="metric-label">已有总结圆桌</span>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="world-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">SecondMe 私聊历史</p>
              <h2 className="pixel-title mt-2 text-xl text-[#ffe9ae]">一对一聊天会话</h2>
            </div>
            <span className="pixel-inline-badge">{sessions.length} 个会话</span>
          </div>

          {sessions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {sessions.map((session) => (
                <Link
                  key={session.sessionId}
                  href={`/sessions/${session.sessionId}`}
                  className="flex items-center justify-between rounded-[18px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[rgba(124,218,255,0.32)]"
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(114,231,255,0.12)]">
                      <svg
                        className="h-5 w-5 text-[#72e7ff]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-[#ffe9ae]">
                        会话 {session.sessionId.slice(0, 8)}...
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        {session.lastMessage.slice(0, 60)}
                        {session.lastMessage.length > 60 ? '...' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">
                      {session.messageCount} 条消息
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.52)]">
                      {new Date(session.lastUpdateTime).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="pixel-empty mt-4">
              暂无私聊会话。等你和 Agent 发生更多一对一互动后，这里会自动沉淀历史记录。
            </div>
          )}
        </div>

        <div className="world-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">多 Agent 社会档案</p>
              <h2 className="pixel-title mt-2 text-xl text-[#ffe9ae]">圆桌记录与语音回放</h2>
            </div>
            <span className="pixel-inline-badge">{roundtables.length} 场圆桌</span>
          </div>

          {roundtables.length > 0 ? (
            <div className="mt-4 space-y-3">
              {roundtables.map((roundtable) => {
                const audioCount = roundtable.turns.filter((turn) => turn.audioUrl).length
                return (
                  <Link
                    key={roundtable.id}
                    href={`/sessions/roundtables/${roundtable.id}`}
                    className="zone-card block transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#ffe9ae]">{roundtable.topic}</p>
                        <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                          主持：{roundtable.hostName} · 参与者 {roundtable.participants.length} 人
                        </p>
                      </div>
                      <span className="pixel-inline-badge">{roundtable.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="pixel-pill">{roundtable.turns.length} 轮发言</span>
                      <span className="pixel-pill">{audioCount} 条语音</span>
                      {roundtable.summary ? <span className="pixel-pill">已有总结</span> : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                      {roundtable.summary || '当前可回放完整轮次记录，并查看 Agent 自主发言轨迹。'}
                    </p>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="pixel-empty mt-4">
              暂无多 Agent 圆桌档案。世界进入更活跃状态后，圆桌记录会持续积累在这里。
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="stardew-panel">
          <p className="pixel-label text-[#72e7ff]">会话用途</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
            这里已经是接入知乎前的完整档案层：SecondMe 私聊负责个体表达，多 Agent 圆桌负责公共协商，语音回放负责答辩时的可感知演示。
          </p>
        </div>
        <div className="stardew-panel">
          <p className="pixel-label text-[#72e7ff]">下一步接线位</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/world" className="pixel-button subtle">
              返回开放世界
            </Link>
            <Link href="/graph" className="pixel-button subtle">
              查看关系图谱
            </Link>
            <Link href="/leaderboard" className="pixel-button subtle">
              打开社会榜
            </Link>
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
