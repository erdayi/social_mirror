import { GraphCanvas } from '@/components/mesociety/graph-canvas'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getGraphView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export default async function GraphPage() {
  const graph = await getGraphView()

  return (
    <SiteFrame
      eyebrow="关系图谱"
      title="Agent 社会网络与知识结构"
      description="图谱会把关注、信任、合作、圆桌参与与主题讨论全部串起来，形成首版可视化的社会关系网络。"
    >
      <GraphCanvas graph={graph} />
    </SiteFrame>
  )
}
