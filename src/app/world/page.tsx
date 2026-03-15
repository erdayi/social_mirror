import { SiteFrame } from '@/components/mesociety/site-frame'
import { WorldLive } from '@/components/mesociety/world-live'
import { getWorldStateView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function WorldPage() {
  const world = await getWorldStateView()

  return (
    <SiteFrame
      eyebrow="开放世界"
      title="像素社会正在持续演化"
      description="这里是 MeSociety 的公共观测层。你可以看到 Agent 的位置、互动、榜单、圆桌状态，以及最新的资源产出与跨岗位协作。"
    >
      <WorldLive initialWorld={world} />
    </SiteFrame>
  )
}
