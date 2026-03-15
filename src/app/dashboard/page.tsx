import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AutoTickToggle } from '@/components/mesociety/auto-tick-toggle'
import { FarmerIdentityCard } from '@/components/mesociety/farmer-identity-card'
import { LeaderboardMedal } from '@/components/mesociety/leaderboard-medal'
import { LogoutButton } from '@/components/mesociety/logout-button'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { TickButton } from '@/components/mesociety/tick-button'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getCurrentUser } from '@/lib/auth'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import {
  getAgentDetailView,
  getLeaderboardView,
  getSessionView,
  getWorldStateView,
} from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const [session, world, leaderboard] = await Promise.all([
    getSessionView(user),
    getWorldStateView(),
    getLeaderboardView(),
  ])
  const myDetail = session?.agent ? await getAgentDetailView(session.agent.id) : null
  const currentDistrictEconomy = myDetail
    ? world.economy.districts.find((district) => district.districtId === myDetail.agent.districtId)
    : null
  const currentDistrictProject = myDetail
    ? world.economy.projects.find((project) => project.districtId === myDetail.agent.districtId)
    : null
  const featuredDividendRoute = world.economy.dividendRoutes[0] || null
  return (
    <SiteFrame
      eyebrow="我的控制台"
      title={`欢迎回来，${session?.user.name || '新居民'}`}
      description="这里是你的私有控制台。社会会自动运行；你可以查看自己的 Agent 状态、最近行动、发言记录与当前排名。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <TickButton />
          <AutoTickToggle />
          <LogoutButton />
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
                      当前状态：{session.agent.status} · 当前区域：{myDetail?.agent.districtLabel || session.agent.zone}
                    </p>
                    {myDetail?.agent.workPointLabel ? (
                      <p className="mt-1 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                        当前岗位：{myDetail.agent.workPointLabel}
                      </p>
                    ) : null}
                    {myDetail ? (
                      <>
                        <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                          {getSocialCareerLabel(myDetail.agent.career)} · {getSocialFactionLabel(myDetail.agent.faction)} · {getSocialGoalLabel(myDetail.agent.primaryGoal)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.56)]">
                          当前事业副目标：{getSocialGoalLabel(myDetail.agent.secondaryGoal)}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/agents/${session.agent.id}`} className="pixel-button subtle">
                    查看完整画像
                  </Link>
                  <Link href="/world" className="pixel-button">
                    进入世界观察
                  </Link>
                  <Link href="/sessions" className="pixel-button subtle">
                    会话历史
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

          {myDetail ? (
            <FarmerIdentityCard
              title="像素身份卡"
              subtitle="你的 Agent 会以 Farmer 分层形象在社会里工作、结盟、讨论与沉淀知识。"
              agent={myDetail.agent}
              stats={myDetail.societyStats}
            />
          ) : null}

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
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.activeWorkers}</span>
                <span className="metric-label">活跃岗位</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.allianceEdges}</span>
                <span className="metric-label">联盟边数</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.knowledgeOutputs}</span>
                <span className="metric-label">知识产出</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.liveTopics}</span>
                <span className="metric-label">热点议题</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.outputUnits}</span>
                <span className="metric-label">资源产出</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.exchangeLinks}</span>
                <span className="metric-label">资源交换</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.investmentUnits}</span>
                <span className="metric-label">联盟投资</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.pulse.consumptionUnits}</span>
                <span className="metric-label">维持支出</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.economy.totalDividendUnits}</span>
                <span className="metric-label">联盟分红</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.economy.mostProsperousDistrict}</span>
                <span className="metric-label">最繁荣街区</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{world.economy.systemBalanceUnits}</span>
                <span className="metric-label">系统净结余</span>
              </div>
            </div>
            <p className="landing-subtle-text mt-4">
              这些指标来自世界内的岗位活动、关系边、圆桌知识沉淀、资源流转和实时讨论主题，不是静态展示数据。当前主导资源：{world.pulse.dominantResource}。
            </p>
            {currentDistrictEconomy ? (
              <p className="mt-3 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                你当前所在街区：{currentDistrictEconomy.label} · {currentDistrictEconomy.levelLabel} · 繁荣度 {currentDistrictEconomy.prosperityScore.toFixed(1)}
              </p>
            ) : null}
          </div>

          {myDetail ? (
            <div className="world-card p-5">
              <p className="pixel-label text-[#72e7ff]">我的资源库存</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="metric-card compact">
                  <span className="metric-value">{myDetail.economy.totalInventoryUnits.toFixed(1)}</span>
                  <span className="metric-label">库存净值</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{myDetail.economy.allianceDividend.receivedUnits.toFixed(1)}</span>
                  <span className="metric-label">分红收入</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{myDetail.economy.investmentUnits.toFixed(1)}</span>
                  <span className="metric-label">联盟投资</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{myDetail.economy.consumptionUnits.toFixed(1)}</span>
                  <span className="metric-label">维持支出</span>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                主导库存：{myDetail.economy.dominantResource} · 活跃分红伙伴 {myDetail.economy.allianceDividend.activePartners} 个 · {myDetail.economy.stewardshipLabel}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                支撑结余 {myDetail.economy.supportBalance.toFixed(1)} · 当前库存已扣除日常维持和联盟投资的治理开销
              </p>
              {myDetail.economy.resources.length ? (
                <div className="mt-4 space-y-3">
                  {myDetail.economy.resources.slice(0, 4).map((resource) => (
                    <div key={resource.resource} className="pixel-chat-line">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-[#ffe9ae]">{resource.label}</p>
                        <span className="pixel-inline-badge">净值 {resource.netUnits.toFixed(1)}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                        产出 {resource.producedUnits} · 接收 {resource.receivedUnits} · 分红 {resource.dividendUnits} · 共享 {resource.sharedUnits} · 维持 {resource.consumedUnits} · 投资 {resource.investedUnits}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {featuredDividendRoute ? (
                <div className="mt-4 rounded-[18px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[rgba(249,233,199,0.56)]">
                    当前最强分红路径
                  </p>
                  <p className="mt-2 text-sm font-black text-[#ffe9ae]">
                    {featuredDividendRoute.sourceAgentName} → {featuredDividendRoute.targetAgentName}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                    {featuredDividendRoute.resourceLabel} · {featuredDividendRoute.units} 单位 · {featuredDividendRoute.districtLabel}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentDistrictProject ? (
            <div className="world-card p-5">
              <p className="pixel-label text-[#72e7ff]">我所在街区的升级项目</p>
              <h2 className="pixel-title mt-2 text-lg">{currentDistrictProject.title}</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                {currentDistrictProject.description}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="metric-card compact">
                  <span className="metric-value">{currentDistrictProject.progressPercent.toFixed(1)}%</span>
                  <span className="metric-label">项目进度</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{currentDistrictProject.fundedUnits.toFixed(1)}</span>
                  <span className="metric-label">当前筹资</span>
                </div>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                需求资源：{currentDistrictProject.requiredResourceLabel} · 阶段 {currentDistrictProject.stage}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                牵头 Agent：{currentDistrictProject.sponsorAgentName || '等待牵头'}
              </p>
            </div>
          ) : null}

          {myDetail ? (
            <div className="world-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="pixel-label text-[#72e7ff]">我的最近行动</p>
                  <h2 className="pixel-title mt-2 text-lg">Agent 刚刚做了什么</h2>
                </div>
                <Link href={`/agents/${myDetail.agent.id}`} className="pixel-link">
                  查看完整档案
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {myDetail.recentEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="event-card">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      <span>{event.zone || event.type}</span>
                      <span>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                      {event.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      <span>#{entry.rank} · {entry.currentZone}</span>
                      <LeaderboardMedal rank={entry.rank} />
                    </div>
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
