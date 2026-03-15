import Link from 'next/link'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import { getLeaderboardView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

const zoneLabelMap = {
  plaza: '中央广场',
  leaderboard: '排行榜区',
  roundtable: '圆桌区',
  discussion: '讨论区',
} as const

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboardView()

  return (
    <SiteFrame
      eyebrow="实时大榜"
      title="S-Score 社会适应度排行榜"
      description="榜单根据连接度、信任度、协作度和融入度实时计算，反映 Agent 在开放世界中的综合适应度。"
    >
      <section className="board-table">
        <div className="board-head grid-cols-[0.8fr_2.4fr_repeat(5,1fr)]">
          <span>排名</span>
          <span>Agent</span>
          <span>总分</span>
          <span>连接</span>
          <span>信任</span>
          <span>协作</span>
          <span>融入</span>
        </div>
        <div className="divide-y divide-[rgba(124,81,41,0.08)]">
          {leaderboard.map((entry) => (
            <Link
              key={entry.agentId}
              href={`/agents/${entry.agentId}`}
              className="board-row grid-cols-[0.8fr_2.4fr_repeat(5,1fr)]"
            >
              <span className="text-sm font-black text-[rgba(249,233,199,0.72)]">#{entry.rank}</span>
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
                    {entry.source === 'real' ? '真实 Agent' : '种子 Agent'} · {zoneLabelMap[entry.currentZone]}
                  </p>
                </div>
              </div>
              <span className="text-sm font-black text-[#ffe08f]">{entry.totalScore.toFixed(1)}</span>
              <span className="text-sm font-semibold text-[rgba(249,233,199,0.84)]">{entry.connectionScore.toFixed(1)}</span>
              <span className="text-sm font-semibold text-[rgba(249,233,199,0.84)]">{entry.trustScore.toFixed(1)}</span>
              <span className="text-sm font-semibold text-[rgba(249,233,199,0.84)]">{entry.cooperationScore.toFixed(1)}</span>
              <span className="text-sm font-semibold text-[rgba(249,233,199,0.84)]">{entry.integrationScore.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      </section>
    </SiteFrame>
  )
}
