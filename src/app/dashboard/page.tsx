import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AutoTickToggle } from '@/components/mesociety/auto-tick-toggle'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { TickButton } from '@/components/mesociety/tick-button'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getCurrentUser } from '@/lib/auth'
import { getLeaderboardView, getSessionView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/api/auth?action=login')
  }

  const [session, world, leaderboard] = await Promise.all([
    getSessionView(user),
    getWorldStateView(),
    getLeaderboardView(),
  ])
  return (
    <SiteFrame
      eyebrow="我的控制台"
      title={`欢迎回来，${session?.user.name || '新居民'}`}
      description="这里是你的私有控制台。你可以查看自己的 Agent 状态，手动推进一轮社会仿真，并观察自己的位置、状态和排名。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <TickButton />
          <AutoTickToggle />
          <Link href="/api/auth?action=logout" className="pixel-button subtle">
            退出登录
          </Link>
        </div>
      }
    >
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <div className="world-card overflow-hidden p-0">
            <div className="relative h-36 border-b border-[rgba(126,113,186,0.18)]">
              <Image
                src="/stardew/maps/town-indoors.png"
                alt="Town indoors"
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(132,182,255,0.1),rgba(255,224,162,0.8))]" />
            </div>
            <div className="p-5">
            <p className="pixel-label text-[#72e7ff]">我的 Agent</p>
            {session?.agent ? (
              <div className="pixel-status-card mt-4">
                <div className="flex items-center gap-4">
                  <WorldAgentSprite
                    name={session.agent.name}
                    pixelRole={session.agent.pixelRole}
                    pixelPalette={session.agent.pixelPalette}
                    source="real"
                    status={session.agent.status as 'active' | 'idle' | 'degraded'}
                    showPlate={false}
                    size="lg"
                  />
                  <div>
                    <p className="text-lg font-black text-[#ffe9ae]">{session.agent.name}</p>
                    <p className="mt-1 text-sm font-semibold text-[rgba(249,233,199,0.72)]">
                      当前状态：{session.agent.status} · 当前区域：{session.agent.zone}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/agents/${session.agent.id}`} className="pixel-button subtle">
                    查看完整画像
                  </Link>
                  <Link href="/world" className="pixel-button">
                    进入世界观察
                  </Link>
                </div>
              </div>
            ) : (
              <p className="pixel-empty mt-4">
                你的用户资料已存在，但 Agent 尚未成功建档。重新登录一次即可重试 SecondMe 同步。
              </p>
            )}
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">世界状态</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric-card compact">
                <span className="metric-value">{world.tickCount}</span>
                <span className="metric-label">运行 Tick</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.agents.length}</span>
                <span className="metric-label">Agent 总数</span>
              </div>
            </div>
          </div>
        </div>

        <div className="world-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">我的位置</p>
              <h2 className="pixel-title mt-2 text-lg">当前榜单与活跃区域</h2>
            </div>
            <Link href="/leaderboard" className="pixel-link">
              全部大榜
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {leaderboard.slice(0, 8).map((entry) => (
              <div
                key={entry.agentId}
                className={`flex items-center justify-between rounded-[18px] border px-4 py-3 ${
                  entry.agentId === session?.agent?.id
                    ? 'border-[rgba(93,89,167,0.42)] bg-[rgba(232,227,255,0.84)]'
                    : 'border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <WorldAgentSprite
                    name={entry.name}
                    pixelRole={entry.pixelRole}
                    pixelPalette={entry.pixelPalette}
                    source={entry.source}
                    status={entry.status}
                    showPlate={false}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-black text-[#ffe9ae]">{entry.name}</p>
                    <p className="text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      #{entry.rank} · {entry.currentZone}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-black text-[#ffe08f]">{entry.totalScore.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  )
}
