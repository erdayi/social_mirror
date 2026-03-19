type ScoreInput = {
  followCount: number
  interactionCount: number
  roundtableCount: number
  circleParticipationCount: number
  hotTopicParticipationCount: number
  referencedCount: number
  trustWeight: number
  allianceWeight: number
  cooperationWeight: number
  contributionScore: number
  zoneDiversity: number
  topicDiversity: number
  complianceScore: number
  stabilityScore: number
  evidenceScore: number
  consensusCount: number
  allianceDividendUnits: number
  exchangeCount: number
  resourceOutputUnits: number
  investmentUnits: number
  prosperityScore: number
  supportBalance: number
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

function scaleDimension(raw: number, pivot: number, ceiling = 92) {
  if (raw <= 0) {
    return 0
  }

  const normalized = (1 - Math.exp(-raw / pivot)) * ceiling
  return clamp(Number(normalized.toFixed(1)))
}

function cap(value: number, max: number) {
  return Math.min(Math.max(0, value), max)
}

export function calculateSScore(input: ScoreInput) {
  const connectionRaw =
    cap(input.followCount, 8) * 1.2 +
    cap(input.interactionCount, 18) * 0.55 +
    cap(input.roundtableCount, 8) * 1.8 +
    cap(input.circleParticipationCount, 6) * 1.4 +
    cap(input.hotTopicParticipationCount, 8) * 1
  const connectionScore = scaleDimension(connectionRaw, 18)

  const trustRaw =
    cap(input.trustWeight, 8) * 2.6 +
    cap(input.allianceWeight, 6) * 1.4 +
    cap((input.complianceScore - 40) / 10, 6) * 1.5 +
    cap(input.evidenceScore, 10) * 0.7 +
    cap(input.allianceDividendUnits, 12) * 0.28
  const trustScore = scaleDimension(trustRaw, 22)

  const cooperationRaw =
    cap(input.cooperationWeight, 8) * 2.4 +
    cap(input.allianceWeight, 6) * 1.8 +
    cap(input.contributionScore / 10, 8) * 1.2 +
    cap(input.exchangeCount, 10) * 1.1 +
    cap(input.resourceOutputUnits / 4, 10) * 0.9 +
    cap(input.allianceDividendUnits / 2, 8) * 0.8 +
    cap(input.investmentUnits / 3, 8) * 0.75
  const cooperationScore = scaleDimension(cooperationRaw, 24)

  const integrationRaw =
    cap(input.zoneDiversity, 4) * 3 +
    cap(input.roundtableCount, 8) * 1.2 +
    cap((input.complianceScore - 40) / 8, 8) * 1 +
    cap(input.circleParticipationCount, 6) * 1.5 +
    cap(input.hotTopicParticipationCount, 8) * 0.9 +
    cap(input.evidenceScore, 10) * 0.45 +
    cap(input.prosperityScore / 6, 10) * 0.85 +
    cap(Math.max(0, input.supportBalance) / 3, 8) * 0.8
  const integrationScore = scaleDimension(integrationRaw, 22)

  const totalScore = clamp(
    Number(
      (
        connectionScore * 0.25 +
        trustScore * 0.3 +
        cooperationScore * 0.25 +
        integrationScore * 0.2
      ).toFixed(1)
    )
  )

  return {
    totalScore,
    connectionScore,
    trustScore,
    cooperationScore,
    integrationScore,
  }
}
