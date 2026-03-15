import type { CSSProperties } from 'react'
import { memo } from 'react'
import type { AgentSource, AgentStatus } from '@prisma/client'
import { getSpriteSheetForAgent } from '@/lib/mesociety/assets'

type Props = {
  name: string
  pixelRole: string
  pixelPalette: string
  source: AgentSource
  status?: AgentStatus
  activity?: string | null
  size?: 'sm' | 'md' | 'lg'
  moving?: boolean
  seated?: boolean
  facing?: 'left' | 'right'
  emphasis?: boolean
  showPlate?: boolean
}

export const WorldAgentSprite = memo(function WorldAgentSprite({
  name,
  pixelRole,
  pixelPalette,
  source,
  status = 'active',
  activity,
  size = 'md',
  moving = false,
  seated = false,
  facing = 'right',
  emphasis = false,
  showPlate = true,
}: Props) {
  const activityLabel = activity?.trim().slice(0, 16) || null
  const scaleMap = {
    sm: 2.4,
    md: 2.9,
    lg: 3.4,
  } as const
  const scale = scaleMap[size]
  const row =
    seated || moving
      ? facing === 'left'
        ? 3
        : 1
      : facing === 'left'
        ? 2
        : 0
  const baseFrame = emphasis ? 1 : 0
  const spriteKey = `${name}:${pixelRole}:${pixelPalette}:${source}`
  const spriteStyle = {
    '--sprite-scale': String(scale),
    '--sprite-row': String(row),
    '--sprite-row-y': `${-row * 32 * scale}px`,
    width: `${16 * scale}px`,
    height: `${32 * scale}px`,
    backgroundImage: `url(${getSpriteSheetForAgent(spriteKey)})`,
    backgroundSize: `${64 * scale}px auto`,
    backgroundPosition: `${-baseFrame * 16 * scale}px ${-row * 32 * scale}px`,
  } as CSSProperties

  return (
    <div className={`sprite-shell ${showPlate ? 'with-plate' : ''}`}>
      {activityLabel ? <div className="sprite-bubble">{activityLabel}</div> : null}

      <div
        className={[
          'world-agent-sprite',
          `size-${size}`,
          `palette-${pixelPalette}`,
          `role-${pixelRole}`,
          source === 'real' ? 'source-real' : 'source-seed',
          status === 'degraded' ? 'is-degraded' : '',
          moving ? 'is-moving' : '',
          seated ? 'is-seated' : '',
          facing === 'left' ? 'facing-left' : 'facing-right',
          emphasis ? 'is-emphasis' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={name}
      >
        <span className="sprite-shadow" />
        <span className="sprite-seat" />
        <span className="sprite-figure">
          <span className="sprite-sheet" style={spriteStyle} />
          <span className="sprite-badge" />
          <span className="sprite-role-chip">{pixelRole.slice(0, 1).toUpperCase()}</span>
        </span>
      </div>

      {showPlate ? (
        <div className="sprite-plate">
          <span className="sprite-name">{name}</span>
          <span className="sprite-subline">
            {source === 'real' ? '真实 Agent' : '种子 Agent'}
            {status === 'degraded' ? ' · 降级' : ''}
          </span>
        </div>
      ) : null}
    </div>
  )
})
