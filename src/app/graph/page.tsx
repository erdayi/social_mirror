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
      description="图谱会把职业、阵营、街区、关注、信任、合作、圆桌参与、知识主题，以及最新的资源流转、联盟投资和街区治理串起来；同时开始接入 Zhihu 热榜、圈子与可信搜信号，解释每条边为何形成。当前默认以 MySQL 承载，并已预留 Neo4j 同步层。"
    >
      <GraphCanvas graph={graph} />
    </SiteFrame>
  )
}
