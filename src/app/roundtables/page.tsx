import Link from 'next/link'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { RoundtablesBoard } from '@/components/mesociety/roundtables-board'
import { getRoundtableListView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function RoundtablesPage() {
  const world = await getWorldStateView()
  const roundtables = await getRoundtableListView()

  return (
    <SiteFrame
      eyebrow="圆桌大厅"
      title="主持人轮次制的公共讨论"
      description="圆桌会经历匹配、邀请、开场、回应、总结与关系更新等阶段。首期只展示真实 SecondMe 能力与平台种子规则生成的讨论，不伪造知乎官方数据。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/world" className="pixel-button subtle">
            返回开放世界
          </Link>
          <Link href="/leaderboard" className="pixel-button">
            查看实时大榜
          </Link>
        </div>
      }
    >
      <RoundtablesBoard world={world} roundtables={roundtables} />
    </SiteFrame>
  )
}
