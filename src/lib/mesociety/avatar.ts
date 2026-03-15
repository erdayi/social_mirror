import type { AgentBehaviorStyle, AgentStance } from '@prisma/client'

export type FarmerModel = 'farmer' | 'farmer_girl'

export type FarmerLook = {
  model: FarmerModel
  hairIndex: number
  shirtIndex: number
  accessoryIndex: number | null
  hatIndex: number | null
  skinToneIndex: number
  roleAccent: string
}

type AvatarProfile = {
  pixelRole: string
  pixelPalette: string
  farmerLook: FarmerLook
}

const INTEREST_TO_ROLE: Array<{ match: RegExp; role: string }> = [
  { match: /ai|tech|程序|代码|算法|数据/i, role: 'tinker' },
  { match: /艺术|设计|绘画|music|电影|摄影/i, role: 'bard' },
  { match: /哲学|社会|历史|政治|知识/i, role: 'sage' },
  { match: /游戏|动漫|二次元|电竞/i, role: 'ranger' },
  { match: /创业|商业|产品|运营/i, role: 'captain' },
]

const STYLE_TO_PALETTE: Record<AgentBehaviorStyle, string> = {
  rational: 'sunset-amber',
  emotional: 'berry-punch',
  balanced: 'mint-gold',
}

const STANCE_TO_ROLE: Record<AgentStance, string> = {
  support: 'captain',
  oppose: 'ranger',
  neutral: 'sage',
}

const ROLE_TO_ACCENT: Record<string, string> = {
  tinker: '#72e7ff',
  bard: '#ffb27d',
  sage: '#d8b0ff',
  ranger: '#8ff0cb',
  captain: '#ffd68f',
}

const PALETTE_TO_SHIRT_OFFSET: Record<string, number> = {
  'sunset-amber': 6,
  'berry-punch': 28,
  'mint-gold': 54,
}

function hashString(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function deriveFarmerLook(input: {
  seed: string
  role: string
  palette: string
  source?: 'real' | 'seed'
}) {
  const baseHash = hashString(`${input.seed}:${input.role}:${input.palette}`)
  const model: FarmerModel = (baseHash + (input.source === 'real' ? 1 : 0)) % 2 === 0 ? 'farmer' : 'farmer_girl'
  const hairIndex = (baseHash + 11) % 96
  const shirtIndex = (PALETTE_TO_SHIRT_OFFSET[input.palette] || 0) + ((baseHash >> 2) % 14)
  const accessoryIndex = (baseHash >> 3) % 5 === 0 ? null : (baseHash + 17) % 48
  const hatIndex =
    input.source === 'real' || input.role === 'captain' || input.role === 'sage'
      ? (baseHash + 29) % 144
      : (baseHash >> 4) % 4 === 0
        ? (baseHash + 29) % 144
        : null
  const skinToneIndex = (baseHash + 7) % 24

  return {
    model,
    hairIndex,
    shirtIndex,
    accessoryIndex,
    hatIndex,
    skinToneIndex,
    roleAccent: ROLE_TO_ACCENT[input.role] || '#f9e9c7',
  } satisfies FarmerLook
}

export function deriveAvatarProfile(input: {
  interests: string[]
  style: AgentBehaviorStyle
  stance: AgentStance
  source?: 'real' | 'seed'
  seed?: string
}): AvatarProfile {
  const joined = input.interests.join(' ')
  const interestRole =
    INTEREST_TO_ROLE.find((item) => item.match.test(joined))?.role ||
    STANCE_TO_ROLE[input.stance]

  const pixelPalette = STYLE_TO_PALETTE[input.style]

  return {
    pixelRole: interestRole,
    pixelPalette,
    farmerLook: deriveFarmerLook({
      seed: input.seed || joined || `${interestRole}:${pixelPalette}:${input.stance}`,
      role: interestRole,
      palette: pixelPalette,
      source: input.source,
    }),
  }
}

export function deriveFarmerLookFromIdentity(input: {
  seed: string
  pixelRole: string
  pixelPalette: string
  source?: 'real' | 'seed'
}) {
  return deriveFarmerLook({
    seed: input.seed,
    role: input.pixelRole,
    palette: input.pixelPalette,
    source: input.source,
  })
}
