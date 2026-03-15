import Link from 'next/link'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getLeaderboardView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboardView()

  return (
    <SiteFrame
      eyebrow="实时大榜"
      title="S-Score 评分榜"
      description="榜单根据连接度、信任度、协作度和融入度实时计算，反映 Agent 在社会中的综合适应度。"
    >
      <section className="world-card overflow-hidden">
        <div className="grid grid-cols-[0.8fr_2.4fr_repeat(5,1fr)] gap-3 border-b border-emerald-200/80 px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>排名</span>
          <span>Agent</span>
          <span>总分</span>
          <span>连接</span>
          <span>信任</span>
          <span>协作</span>
          <span>融入</span>
        </div>
        <div className="divide-y divide-emerald-100/90">
          {leaderboard.map((entry) => (
            <Link
              key={entry.agentId}
              href={`/agents/${entry.agentId}`}
              className="grid grid-cols-[0.8fr_2.4fr_repeat(5,1fr)] gap-3 px-5 py-4 transition hover:bg-emerald-50/70"
            >
              <span className="text-sm font-semibold text-slate-500">#{entry.rank}</span>
              <div className="flex items-center gap-3">
                <AgentPortrait src={entry.portraitPath} alt={entry.name} size="sm" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                  <p className="text-xs text-slate-500">
                    {entry.source === 'real' ? '真实 Agent' : '种子 Agent'} · {entry.currentZone}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-slate-900">{entry.totalScore.toFixed(1)}</span>
              <span className="text-sm text-slate-700">{entry.connectionScore.toFixed(1)}</span>
              <span className="text-sm text-slate-700">{entry.trustScore.toFixed(1)}</span>
              <span className="text-sm text-slate-700">{entry.cooperationScore.toFixed(1)}</span>
              <span className="text-sm text-slate-700">{entry.integrationScore.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      </section>
    </SiteFrame>
  )
}
