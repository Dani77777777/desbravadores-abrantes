export function calcPoints(
  timeSeconds: number,
  elapsedMs: number,
  pointsMultiplier: number,
  streak: number
): { speedPoints: number; streakBonus: number; finalPoints: number } {
  const maxPoints = 10 * pointsMultiplier
  const speedPoints = Math.max(0, maxPoints * (1 - elapsedMs / (timeSeconds * 1000)))
  const roundedSpeed = Math.round(speedPoints * 1000) / 1000

  let streakMultiplier = 1
  if (streak >= 5) streakMultiplier = 3
  else if (streak >= 3) streakMultiplier = 2

  const streakBonus = Math.round(roundedSpeed * (streakMultiplier - 1) * 1000) / 1000
  const finalPoints = Math.round((roundedSpeed + streakBonus) * 1000) / 1000

  return { speedPoints: roundedSpeed, streakBonus, finalPoints }
}
