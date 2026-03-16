'use client'

import { useMemo } from 'react'
import type { GraphView } from '@/lib/mesociety/types'

type Props = {
  graph: GraphView
}

const typePalette: Record<string, { fill: string; stroke: string; glow: string }> = {
  agent: { fill: '#2f4a84', stroke: '#72e7ff', glow: 'rgba(114, 231, 255, 0.22)' },
  topic: { fill: '#5a3f84', stroke: '#d8b0ff', glow: 'rgba(216, 176, 255, 0.22)' },
  roundtable: { fill: '#6f4c28', stroke: '#ffd68f', glow: 'rgba(255, 214, 143, 0.24)' },
  knowledge: { fill: '#305a56', stroke: '#8ff0cb', glow: 'rgba(143, 240, 203, 0.22)' },
  zone: { fill: '#4a324a', stroke: '#ffb8cb', glow: 'rgba(255, 184, 203, 0.2)' },
}

const edgePalette: Record<string, string> = {
  FOLLOWS: 'rgba(114, 231, 255, 0.32)',
  TRUSTS: 'rgba(143, 240, 203, 0.34)',
  COOPERATES: 'rgba(255, 214, 143, 0.34)',
  REJECTS: 'rgba(255, 133, 173, 0.3)',
  PARTICIPATES_IN: 'rgba(216, 176, 255, 0.3)',
  DISCUSSES: 'rgba(191, 212, 255, 0.32)',
  MENTIONS: 'rgba(249, 233, 199, 0.24)',
}

type PositionedNode = GraphView['nodes'][number] & {
  x: number
  y: number
  width: number
}

function placeBucket(
  nodes: GraphView['nodes'],
  anchorX: number,
  anchorY: number,
  columns: number,
  xGap: number,
  yGap: number
) {
  return nodes.map((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const width = Math.max(88, Math.min(142, node.label.length * 12 + 34))
    return {
      ...node,
      x: anchorX + column * xGap,
      y: anchorY + row * yGap,
      width,
    }
  })
}

export function GraphCanvas({ graph }: Props) {
  const neo4jLabel =
    graph.meta.neo4jStatus === 'connected'
      ? '已连接'
      : graph.meta.neo4jStatus === 'error'
        ? '回退中'
        : graph.meta.neo4jStatus === 'driver_missing'
          ? '驱动缺失'
          : '未配置'
  const nodesByType = useMemo(() => {
    const agents = graph.nodes.filter((node) => node.type === 'agent')
    const topics = graph.nodes.filter((node) => node.type === 'topic')
    const roundtables = graph.nodes.filter((node) => node.type === 'roundtable')
    const knowledge = graph.nodes.filter((node) => node.type === 'knowledge')
    const zones = graph.nodes.filter((node) => node.type === 'zone')
    const others = graph.nodes.filter(
      (node) => !['agent', 'topic', 'roundtable', 'knowledge', 'zone'].includes(node.type)
    )

    return { agents, topics, roundtables, knowledge, zones, others }
  }, [graph.nodes])

  const positions = useMemo(() => {
    return [
      ...placeBucket(nodesByType.agents, 82, 78, 2, 160, 76),
      ...placeBucket(nodesByType.topics, 516, 74, 2, 156, 72),
      ...placeBucket(nodesByType.roundtables, 338, 220, 1, 150, 74),
      ...placeBucket(nodesByType.knowledge, 534, 288, 2, 144, 72),
      ...placeBucket(nodesByType.zones, 112, 326, 2, 160, 70),
      ...placeBucket(nodesByType.others, 336, 366, 2, 146, 70),
    ] satisfies PositionedNode[]
  }, [nodesByType])

  const byId = useMemo(() => new Map(positions.map((node) => [node.id, node])), [positions])

  const edgeStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of graph.edges) {
      counts.set(edge.type, (counts.get(edge.type) || 0) + 1)
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])
  }, [graph.edges])

  const featuredNodes = useMemo(() => {
    const degrees = new Map<string, number>()
    for (const edge of graph.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1)
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1)
    }

    return positions
      .map((node) => ({
        ...node,
        degree: degrees.get(node.id) || 0,
      }))
      .sort((left, right) => right.degree - left.degree || right.size - left.size)
      .slice(0, 6)
  }, [graph.edges, positions])

  const stats = useMemo(
    () => [
      { label: 'Agent 节点', value: nodesByType.agents.length },
      { label: '主题节点', value: nodesByType.topics.length },
      { label: '知识节点', value: nodesByType.knowledge.length + nodesByType.roundtables.length },
      { label: '关系边', value: graph.edges.length },
    ],
    [graph.edges.length, nodesByType.agents.length, nodesByType.knowledge.length, nodesByType.roundtables.length, nodesByType.topics.length]
  )

  return (
    <div className="world-card overflow-hidden p-5">
      <div className="graph-meta-bar">
        <span className="pixel-pill">
          图谱后端：{graph.meta.backend === 'neo4j' ? 'Neo4j' : 'MySQL'}
        </span>
        <span className="pixel-inline-badge">Neo4j 状态：{neo4jLabel}</span>
        {graph.meta.reason ? (
          <span className="text-xs font-semibold text-[rgba(249,233,199,0.72)]">
            {graph.meta.reason}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="metric-card compact">
            <span className="metric-value">{item.value}</span>
            <span className="metric-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="graph-stage mt-5">
        <svg viewBox="0 0 840 520" className="h-[520px] w-full">
          <defs>
            <linearGradient id="graphBackdrop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#241833" />
              <stop offset="100%" stopColor="#140f1d" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="840" height="520" rx="32" fill="url(#graphBackdrop)" />
          <rect x="18" y="18" width="804" height="484" rx="24" fill="rgba(20,15,29,0.28)" stroke="rgba(126,113,186,0.22)" strokeWidth="2" />

          {Array.from({ length: 16 }).map((_, index) => (
            <line
              key={`v-${index}`}
              x1={40 + index * 48}
              y1="30"
              x2={40 + index * 48}
              y2="490"
              stroke="rgba(114,231,255,0.05)"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: 10 }).map((_, index) => (
            <line
              key={`h-${index}`}
              x1="30"
              y1={42 + index * 46}
              x2="810"
              y2={42 + index * 46}
              stroke="rgba(114,231,255,0.05)"
              strokeWidth="1"
            />
          ))}

          {graph.edges.map((edge) => {
            const source = byId.get(edge.source)
            const target = byId.get(edge.target)

            if (!source || !target) {
              return null
            }

            const midX = (source.x + target.x) / 2
            const deltaX = (target.x - source.x) * 0.18
            const edgeColor = edgePalette[edge.type] || 'rgba(249, 233, 199, 0.22)'

            return (
              <g key={edge.id}>
                <path
                  d={`M ${source.x} ${source.y} C ${midX - deltaX} ${source.y}, ${midX + deltaX} ${target.y}, ${target.x} ${target.y}`}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={Math.max(1.5, edge.weight * 1.25)}
                  strokeLinecap="round"
                />
                <text
                  x={midX}
                  y={(source.y + target.y) / 2 - 8}
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={edgeColor}
                >
                  {edge.type}
                </text>
              </g>
            )
          })}

          {positions.map((node) => {
            const palette = typePalette[node.type] || {
              fill: '#3b3551',
              stroke: '#f9e9c7',
              glow: 'rgba(249, 233, 199, 0.16)',
            }
            const rectX = node.x - node.width / 2
            const rectY = node.y - 20

            return (
              <g key={node.id}>
                <rect
                  x={rectX - 3}
                  y={rectY - 3}
                  width={node.width + 6}
                  height="46"
                  rx="18"
                  fill={palette.glow}
                />
                <rect
                  x={rectX}
                  y={rectY}
                  width={node.width}
                  height="40"
                  rx="16"
                  fill={palette.fill}
                  stroke={palette.stroke}
                  strokeWidth="2"
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  fontSize="12"
                  fontWeight="800"
                  textAnchor="middle"
                  fill="#F9E9C7"
                >
                  {node.label.length > 11 ? `${node.label.slice(0, 11)}…` : node.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {[
          ['agent', 'Agent'],
          ['topic', 'Topic'],
          ['roundtable', 'Roundtable'],
          ['knowledge', 'Knowledge'],
          ['zone', 'Zone'],
        ].map(([type, label]) => {
          const palette = typePalette[type]
          return (
            <div key={type} className="stardew-panel flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-[4px]"
                style={{
                  background: palette.fill,
                  boxShadow: `0 0 0 2px ${palette.stroke} inset`,
                }}
              />
              <span className="text-sm font-black text-[#ffe9ae]">{label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="stardew-panel">
          <p className="pixel-label text-[#72e7ff]">关系构成</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {edgeStats.map(([type, count]) => (
              <div key={type} className="metric-card compact">
                <span className="metric-value">{count}</span>
                <span className="metric-label">{type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stardew-panel">
          <p className="pixel-label text-[#72e7ff]">高连接节点</p>
          <div className="mt-4 space-y-3">
            {featuredNodes.map((node) => (
              <div key={node.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.82)] px-4 py-3">
                <div>
                  <p className="text-sm font-black text-[#ffe9ae]">{node.label}</p>
                  <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                    类型：{node.type}
                  </p>
                </div>
                <span className="pixel-inline-badge">{node.degree} 条连接</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
