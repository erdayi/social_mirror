import type { CSSProperties } from 'react'
import { memo } from 'react'
import type { AgentSource, AgentStatus } from '@prisma/client'
import { FARMER_ATLAS } from '@/lib/mesociety/assets'
import { deriveFarmerLookFromIdentity } from '@/lib/mesociety/avatar'

export type AgentDirection = 'up' | 'down' | 'left' | 'right'
export type AgentMode =
  | 'idle'
  | 'walking'
  | 'running'
  | 'talking'
  | 'observing'
  | 'listening'
  | 'seated'

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
  direction?: AgentDirection
  mode?: AgentMode
  voiceActive?: boolean
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
  direction,
  mode,
  voiceActive = false,
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
  const resolvedDirection =
    direction || (facing === 'left' ? 'left' : facing === 'right' ? 'right' : 'down')
  const resolvedMode = seated ? 'seated' : mode || (moving ? 'walking' : 'idle')
  const rowMap: Record<AgentDirection, number> = {
    down: 0,
    right: 1,
    up: 2,
    left: 3,
  }
  const row = rowMap[resolvedDirection]
  const baseFrameMap: Record<AgentMode, number> = {
    idle: emphasis ? 1 : 0,
    walking: 0,
    running: 0,
    talking: 2,
    observing: 1,
    listening: 3,
    seated: 0,
  }
  const baseFrame = baseFrameMap[resolvedMode]
  const spriteKey = `${name}:${pixelRole}:${pixelPalette}:${source}`
  const farmerLook = deriveFarmerLookFromIdentity({
    seed: spriteKey,
    pixelRole,
    pixelPalette,
    source,
  })
  const spriteStyle = {
    '--sprite-scale': String(scale),
    '--sprite-row': String(row),
    '--sprite-row-y': `${-row * 32 * scale}px`,
    '--sprite-frame-x': `${-baseFrame * 16 * scale}px`,
    width: `${16 * scale}px`,
    height: `${32 * scale}px`,
    backgroundImage: `url(${FARMER_ATLAS.base[farmerLook.model]})`,
    backgroundSize: `${384 * scale}px auto`,
    backgroundPosition: `${-baseFrame * 16 * scale}px ${-row * 32 * scale}px`,
    '--farmer-accent': farmerLook.roleAccent,
  } as CSSProperties
  const hairStyle = {
    width: `${16 * scale}px`,
    height: `${32 * scale}px`,
    backgroundImage: `url(${FARMER_ATLAS.hair})`,
    backgroundSize: `${128 * scale}px ${384 * scale}px`,
    backgroundPosition: `${-(farmerLook.hairIndex % 8) * 16 * scale}px ${-Math.floor(farmerLook.hairIndex / 8) * 32 * scale}px`,
  } as CSSProperties
  const shirtStyle = {
    width: `${16 * scale}px`,
    height: `${16 * scale}px`,
    backgroundImage: `url(${FARMER_ATLAS.shirt})`,
    backgroundSize: `${128 * scale}px ${224 * scale}px`,
    backgroundPosition: `${-(farmerLook.shirtIndex % 8) * 16 * scale}px ${-Math.floor(farmerLook.shirtIndex / 8) * 16 * scale}px`,
    bottom: `${12 + scale * 6}px`,
  } as CSSProperties
  const accessoryStyle =
    farmerLook.accessoryIndex === null
      ? null
      : ({
          width: `${16 * scale}px`,
          height: `${16 * scale}px`,
          backgroundImage: `url(${FARMER_ATLAS.accessory})`,
          backgroundSize: `${128 * scale}px ${96 * scale}px`,
          backgroundPosition: `${-(farmerLook.accessoryIndex % 8) * 16 * scale}px ${-Math.floor(farmerLook.accessoryIndex / 8) * 16 * scale}px`,
          bottom: `${14 + scale * 10}px`,
        } as CSSProperties)
  const hatStyle =
    farmerLook.hatIndex === null
      ? null
      : ({
          width: `${20 * scale}px`,
          height: `${20 * scale}px`,
          backgroundImage: `url(${FARMER_ATLAS.hat})`,
          backgroundSize: `${240 * scale}px ${240 * scale}px`,
          backgroundPosition: `${-(farmerLook.hatIndex % 12) * 20 * scale}px ${-Math.floor(farmerLook.hatIndex / 12) * 20 * scale}px`,
          bottom: `${18 + scale * 20}px`,
        } as CSSProperties)

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
          `direction-${resolvedDirection}`,
          `mode-${resolvedMode}`,
          voiceActive ? 'is-voice-active' : '',
          emphasis ? 'is-emphasis' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={name}
      >
        <span className="sprite-shadow" />
        <span className="sprite-seat" />
        <span className="sprite-figure">
          <span className="sprite-sheet sprite-base-sheet" style={spriteStyle} />
          <span className="sprite-layer sprite-hair-layer" style={hairStyle} />
          <span className="sprite-layer sprite-shirt-layer" style={shirtStyle} />
          {accessoryStyle ? (
            <span className="sprite-layer sprite-accessory-layer" style={accessoryStyle} />
          ) : null}
          {hatStyle ? <span className="sprite-layer sprite-hat-layer" style={hatStyle} /> : null}
          <span className="sprite-badge" />
          <span className="sprite-voice-indicator" />
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
