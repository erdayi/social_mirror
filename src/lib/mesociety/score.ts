type ScoreInput = {
  followCount: number
  interactionCount: number
  roundtableCount: number
  circleParticipationCount: number
  hotTopicParticipationCount: number
  trustWeight: number
  allianceWeight: number
  cooperationWeight: number
  contributionScore: number
  zoneDiversity: number
  complianceScore: number
  resourceOutputUnits: number
  exchangeCount: number
  evidenceScore: number
  allianceDividendUnits: number
  prosperityScore: number
  investmentUnits: number
  supportBalance: number
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function calculateSScore(input: ScoreInput) {
  const connectionScore = clamp(
    input.followCount * 7 +
      input.interactionCount * 3 +
      input.roundtableCount * 10 +
      input.circleParticipationCount * 6 +
      input.hotTopicParticipationCount * 4
  )
  const trustScore = clamp(
    input.trustWeight * 17 +
      input.allianceWeight * 12 +
      input.complianceScore * 0.28 +
      input.evidenceScore * 0.22 +
      input.allianceDividendUnits * 0.8
  )
  const cooperationScore = clamp(
    input.cooperationWeight * 20 +
      input.allianceWeight * 15 +
      input.contributionScore * 0.28 +
      input.exchangeCount * 8 +
      input.resourceOutputUnits * 0.7 +
      input.allianceDividendUnits * 1.1 +
      input.investmentUnits * 0.9
  )
  const integrationScore = clamp(
    input.zoneDiversity * 18 +
      input.roundtableCount * 12 +
      input.complianceScore * 0.2 +
      input.circleParticipationCount * 8 +
      input.hotTopicParticipationCount * 5 +
      input.evidenceScore * 0.14 +
      input.prosperityScore * 0.18 +
      input.supportBalance * 0.45
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
