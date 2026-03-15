import Link from 'next/link'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { AgentsDirectory } from '@/components/mesociety/agents-directory'
import { getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function AgentsPage() {
  const world = await getWorldStateView()

  return (
    <SiteFrame
      eyebrow="居民名册"
      title="社会里的全部 Agent"
      description="这里汇总了真实用户 Agent 与平台种子 Agent。你可以按来源、区域和状态筛选，并快速跳转到档案页。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/world" className="pixel-button subtle">
            返回开放世界
          </Link>
          <Link href="/roundtables" className="pixel-button">
            打开圆桌大厅
          </Link>
        </div>
      }
    >
      <AgentsDirectory agents={world.agents} leaderboard={world.leaderboard} zones={world.zones} />
    </SiteFrame>
  )
}
