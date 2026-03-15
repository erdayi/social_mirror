'use client'

import { useMemo } from 'react'
import type { GraphView } from '@/lib/mesociety/types'

type Props = {
  graph: GraphView
}

export function GraphCanvas({ graph }: Props) {
  const positions = useMemo(() => {
    const width = 840
    const height = 460
    const centerX = width / 2
    const centerY = height / 2
    const radius = 160

    return graph.nodes.map((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(graph.nodes.length, 1)
      return {
        ...node,
        x: centerX + Math.cos(angle) * (radius + (index % 3) * 28),
        y: centerY + Math.sin(angle) * (radius - (index % 2) * 18),
      }
    })
  }, [graph.nodes])

  const byId = useMemo(() => new Map(positions.map((node) => [node.id, node])), [positions])

  return (
    <div className="world-card overflow-hidden p-4">
      <svg viewBox="0 0 840 460" className="h-[460px] w-full rounded-3xl bg-[radial-gradient(circle_at_top,_rgba(34,25,50,0.96),_rgba(24,18,37,0.94)_58%,_rgba(14,10,22,0.98))]">
        {graph.edges.map((edge) => {
          const source = byId.get(edge.source)
          const target = byId.get(edge.target)

          if (!source || !target) {
            return null
          }

          return (
            <g key={edge.id}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(114, 231, 255, 0.18)"
                strokeWidth={Math.max(1.5, edge.weight * 1.4)}
              />
              <text
                x={(source.x + target.x) / 2}
                y={(source.y + target.y) / 2 - 6}
                fontSize="10"
                textAnchor="middle"
                fill="#72e7ff"
              >
                {edge.type}
              </text>
            </g>
          )
        })}

        {positions.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size}
              fill={
                node.type === 'agent'
                  ? '#f1b45e'
                  : node.type === 'topic'
                    ? '#7e7fcd'
                    : node.type === 'knowledge'
                      ? '#78b0f7'
                      : '#d88f5b'
              }
              stroke="#f9e9c7"
              strokeWidth="4"
            />
            <text x={node.x} y={node.y + 4} fontSize="11" textAnchor="middle" fill="#140f1d">
              {node.label.slice(0, 4)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
