type Props = {
  rank: number
}

const medalMap = {
  1: { label: '金牌', className: 'gold' },
  2: { label: '银牌', className: 'silver' },
  3: { label: '铜牌', className: 'bronze' },
} as const

export function LeaderboardMedal({ rank }: Props) {
  const medal = medalMap[rank as keyof typeof medalMap]

  if (!medal) {
    return null
  }

  return (
    <span className={`leaderboard-medal ${medal.className}`}>
      <span className="leaderboard-medal-core" />
      {medal.label}
    </span>
  )
}
