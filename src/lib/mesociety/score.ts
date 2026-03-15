type ScoreInput = {
  followCount: number
  interactionCount: number
  roundtableCount: number
  trustWeight: number
  allianceWeight: number
  cooperationWeight: number
  contributionScore: number
  zoneDiversity: number
  complianceScore: number
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function calculateSScore(input: ScoreInput) {
  const connectionScore = clamp(
    input.followCount * 8 + input.interactionCount * 3 + input.roundtableCount * 10
  )
  const trustScore = clamp(
    input.trustWeight * 18 + input.allianceWeight * 12 + input.complianceScore * 0.34
  )
  const cooperationScore = clamp(
    input.cooperationWeight * 20 +
      input.allianceWeight * 15 +
      input.contributionScore * 0.35
  )
  const integrationScore = clamp(
    input.zoneDiversity * 18 +
      input.roundtableCount * 12 +
      input.complianceScore * 0.28
  )

  const totalScore = clamp(
    connectionScore * 0.25 +
      trustScore * 0.3 +
      cooperationScore * 0.25 +
      integrationScore * 0.2
  )

  return {
    totalScore,
    connectionScore,
    trustScore,
    cooperationScore,
    integrationScore,
  }
}
