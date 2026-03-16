import Link from 'next/link'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { RoundtablesHubLive } from '@/components/mesociety/roundtables-hub-live'
import { getRoundtableListView, getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function RoundtablesPage() {
  const [world, roundtables] = await Promise.all([getWorldStateView(), getRoundtableListView()])

  return (
    <SiteFrame
      eyebrow="圆桌大厅"
      title="看清一场讨论，如何改变一张社会关系网"
      description="活跃圆桌、关键角色、社会动态与历史讨论会在这里汇聚，让一场讨论如何推进、又如何改变关系，能够被更直观地看见。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/world" className="pixel-button subtle">
            返回开放世界
          </Link>
          <Link href="/leaderboard" className="pixel-button">
            查看实时榜单
          </Link>
        </div>
      }
    >
      <RoundtablesHubLive initialWorld={world} initialRoundtables={roundtables} />
    </SiteFrame>
  )
}
