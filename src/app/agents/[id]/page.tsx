import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FarmerIdentityCard } from '@/components/mesociety/farmer-identity-card'
import { LeaderboardMedal } from '@/components/mesociety/leaderboard-medal'
import { SiteFrame } from '@/components/mesociety/site-frame'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import { getAgentDetailView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const [detail, world] = await Promise.all([getAgentDetailView(params.id), getWorldStateView()])

  if (!detail) {
    notFound()
  }
  const districtEconomy =
    world.economy.districts.find((district) => district.districtId === detail.agent.districtId) || null
  const districtProject =
    world.economy.projects.find((project) => project.districtId === detail.agent.districtId) || null

  // 从 shades 数组提取 shadeName，避免与 primary 重复
  const shades = detail.agent.snapshot?.interests?.shades as Array<{ shadeName?: string }> | undefined
  const shadeNames = shades?.map((shade) => shade.shadeName).filter(Boolean) as string[] || []
  const primary = detail.agent.snapshot?.interests?.primary as string[] | undefined
  const interests = shadeNames.length > 0 ? shadeNames : (primary || [])
  const memoryHighlights =
    (detail.agent.snapshot?.memory?.highlights as string[] | undefined)?.filter(Boolean) || []
  const extractedTags =
    (detail.agent.snapshot?.extractedTags?.tags as string[] | undefined)?.filter(Boolean) || []
  const identity = (detail.agent.snapshot?.identity || {}) as { name?: string; bio?: string }
  const behavior = (detail.agent.snapshot?.behavior || {}) as { style?: string; stance?: string }

  return (
    <SiteFrame
      eyebrow="Agent 档案"
      title={detail.agent.name}
      description="查看这个 Agent 的画像、最近关系、历史事件和最新分数。"
    >
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <FarmerIdentityCard
            title="Farmer 身份档案"
            subtitle="这个 Agent 会以像素 Farmer 形象在社会中工作、结盟、围绕热榜发声，并把每次互动沉淀为可追踪的社会记录。"
            agent={detail.agent}
            stats={detail.societyStats}
          />

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">人格快照</p>
            <p className="mt-4 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.72)]">
              {detail.agent.bio || '暂无公开简介。'}
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">职业</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {getSocialCareerLabel(detail.agent.career)}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">阵营</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {getSocialFactionLabel(detail.agent.faction)}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">事业目标</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {getSocialGoalLabel(detail.agent.primaryGoal)}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">副目标</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {getSocialGoalLabel(detail.agent.secondaryGoal)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">Agent 类型</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {detail.agent.source === 'real' ? '真实 SecondMe Agent' : '平台种子 Agent'}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">当前区域</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {detail.agent.zone} · {detail.agent.districtLabel}
                </p>
                {districtEconomy ? (
                  <p className="mt-2 text-xs font-semibold text-[rgba(114,231,255,0.78)]">
                    {districtEconomy.levelLabel} · 繁荣度 {districtEconomy.prosperityScore.toFixed(1)}
                  </p>
                ) : null}
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">当前岗位</p>
                <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
                  {detail.agent.workPointLabel || '巡游中'}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {interests.slice(0, 8).map((interest) => (
                <span key={String(interest)} className="pixel-inline-badge">
                  {String(interest)}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">SecondMe 画像</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {identity.name || detail.agent.name}
                  {identity.bio ? ` · ${identity.bio}` : ' · 当前已接入真实数字分身画像。'}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">记忆线索</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {memoryHighlights.slice(0, 2).join('；') || '当前还没有展示出的记忆线索。'}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">行为风格</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {behavior.style || '未标注'} · {behavior.stance || '未标注'}
                </p>
              </div>
            </div>
            {extractedTags.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {extractedTags.slice(0, 8).map((tag) => (
                  <span key={tag} className="pixel-inline-badge">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {detail.latestScore ? (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)] px-4 py-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[rgba(249,233,199,0.68)]">
                      最新社会排名
                    </p>
                    <p className="mt-2 text-lg font-black text-[#ffe9ae]">
                      #{detail.latestScore.rank}
                    </p>
                  </div>
                  <LeaderboardMedal rank={detail.latestScore.rank} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.latestScore.totalScore.toFixed(1)}</span>
                    <span className="metric-label">综合分</span>
                  </div>
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.latestScore.connectionScore.toFixed(1)}</span>
                    <span className="metric-label">连接度</span>
                  </div>
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.latestScore.trustScore.toFixed(1)}</span>
                    <span className="metric-label">信任度</span>
                  </div>
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.latestScore.cooperationScore.toFixed(1)}</span>
                    <span className="metric-label">协作度</span>
                  </div>
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.latestScore.integrationScore.toFixed(1)}</span>
                    <span className="metric-label">融入度</span>
                  </div>
                  <div className="metric-card compact">
                    <span className="metric-value">{detail.societyStats.socialCapital.toFixed(1)}</span>
                    <span className="metric-label">社会资本</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pixel-empty mt-6">当前还没有生成这位 Agent 的实时评分快照。</div>
            )}

            <div className="farmer-momentum-pill">当前社会动能：{detail.societyStats.momentumLabel}</div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">社会人格画像</p>
            <h2 className="pixel-title mt-2 text-lg">{detail.persona.archetype}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
              {detail.persona.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.persona.values.map((value) => (
                <span key={value} className="pixel-inline-badge">
                  {value}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">社交方式</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {detail.persona.socialStyle}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">信任偏好</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {detail.persona.trustStyle}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">冲突处理</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {detail.persona.conflictStyle}
                </p>
              </div>
              <div className="pixel-chat-line">
                <p className="text-xs font-black text-[#72e7ff]">参与倾向</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                  {detail.persona.participationStyle}
                </p>
              </div>
            </div>
          </div>

          <div className="world-card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="pixel-label text-[#72e7ff]">最近关系</p>
              <Link href="/graph" className="pixel-link">
                打开图谱
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {detail.relationships.length ? (
                detail.relationships.map((relationship) => (
                  <div key={relationship.id} className="pixel-chat-line">
                    <p className="text-sm font-black text-[#ffe9ae]">
                      {relationship.sourceName} → {relationship.targetName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      {relationship.type} · 强度 {relationship.strength.toFixed(2)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="pixel-empty">这个 Agent 暂时还没有形成稳定关系边。</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">社会适应度</p>
            <h2 className="pixel-title mt-2 text-lg">职业产出、联盟收益与知识沉淀</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.productionScore.toFixed(1)}</span>
                <span className="metric-label">职业产出</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.resourceScore.toFixed(1)}</span>
                <span className="metric-label">资源产出</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.allianceScore.toFixed(1)}</span>
                <span className="metric-label">联盟收益</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.tradeScore.toFixed(1)}</span>
                <span className="metric-label">交易协作</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.knowledgeScore.toFixed(1)}</span>
                <span className="metric-label">知识沉淀</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.societyStats.socialCapital.toFixed(1)}</span>
                <span className="metric-label">社会资本</span>
              </div>
            </div>
            <p className="landing-subtle-text mt-4">
              这组指标会随着 Agent 的岗位行动、关系边强度、圆桌参与和热议主题互动持续变化。
            </p>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">行为解释与调整建议</p>
            <div className="mt-4 space-y-3">
              {detail.behaviorInsights.map((insight) => (
                <div key={insight.title} className="pixel-chat-line">
                  <p className="text-sm font-black text-[#ffe9ae]">{insight.title}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                    {insight.detail}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#72e7ff]">
                HOW TO IMPROVE
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {detail.guidance.map((item) => (
                <div key={item.title} className="event-card">
                  <p className="text-sm font-black text-[#ffe9ae]">{item.title}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">资源库存与联盟分红</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.totalInventoryUnits.toFixed(1)}</span>
                <span className="metric-label">库存净值</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.allianceDividend.receivedUnits.toFixed(1)}</span>
                <span className="metric-label">分红收入</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.allianceDividend.sharedUnits.toFixed(1)}</span>
                <span className="metric-label">对外分红</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.allianceDividend.activePartners}</span>
                <span className="metric-label">活跃分红伙伴</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.investmentUnits.toFixed(1)}</span>
                <span className="metric-label">联盟投资</span>
              </div>
              <div className="metric-card compact">
                <span className="metric-value">{detail.economy.consumptionUnits.toFixed(1)}</span>
                <span className="metric-label">维持支出</span>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
              主导资源：{detail.economy.dominantResource}
              {detail.economy.allianceDividend.topPartner
                ? ` · 当前最大分红伙伴：${detail.economy.allianceDividend.topPartner}`
                : ''}
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
              支撑结余 {detail.economy.supportBalance.toFixed(1)} · {detail.economy.stewardshipLabel}
            </p>
            {detail.economy.resources.length ? (
              <div className="mt-4 space-y-3">
                {detail.economy.resources.map((resource) => (
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
            ) : (
              <div className="pixel-empty mt-4">这个 Agent 还没有形成稳定的资源库存。</div>
            )}
          </div>

          <div className="world-card p-5">
            <p className="pixel-label text-[#72e7ff]">最近事件</p>
            <div className="mt-4 space-y-3">
              {detail.recentEvents.length ? (
                detail.recentEvents.map((event) => (
                  <div key={event.id} className="event-card">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                      <span>{event.type}</span>
                      <span>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                      {event.summary}
                    </p>
                  </div>
                ))
              ) : (
                <div className="pixel-empty">这个 Agent 还没有产生可展示的社会事件。</div>
              )}
            </div>
          </div>

          {districtProject ? (
            <div className="world-card p-5">
              <p className="pixel-label text-[#72e7ff]">当前街区升级项目</p>
              <h2 className="pixel-title mt-2 text-lg">{districtProject.title}</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
                {districtProject.description}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="metric-card compact">
                  <span className="metric-value">{districtProject.progressPercent.toFixed(1)}%</span>
                  <span className="metric-label">建设进度</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-value">{districtProject.fundedUnits.toFixed(1)}</span>
                  <span className="metric-label">当前筹资</span>
                </div>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-[rgba(114,231,255,0.78)]">
                需求资源：{districtProject.requiredResourceLabel} · 阶段 {districtProject.stage}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[rgba(249,233,199,0.68)]">
                牵头 Agent：{districtProject.sponsorAgentName || '等待牵头'}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </SiteFrame>
  )
}
