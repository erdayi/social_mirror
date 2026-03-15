import type { AgentBehaviorStyle, AgentStance } from '@prisma/client'

type AvatarProfile = {
  pixelRole: string
  pixelPalette: string
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

export function deriveAvatarProfile(input: {
  interests: string[]
  style: AgentBehaviorStyle
  stance: AgentStance
}): AvatarProfile {
  const joined = input.interests.join(' ')
  const interestRole =
    INTEREST_TO_ROLE.find((item) => item.match.test(joined))?.role ||
    STANCE_TO_ROLE[input.stance]

  return {
    pixelRole: interestRole,
    pixelPalette: STYLE_TO_PALETTE[input.style],
  }
}
