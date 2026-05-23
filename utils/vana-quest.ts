/**
 * Calcula o tempo de leitura da pergunta no ecrã de intro (em segundos)
 * baseado no número de caracteres.
 *
 * Pressupõe ~25 caracteres por segundo de leitura confortável + 3s de buffer.
 * Mínimo 4s, máximo 10s.
 */
export function getIntroSeconds(questionText: string): number {
  const len = (questionText || '').length
  const seconds = Math.round(3 + len / 25)
  return Math.max(4, Math.min(10, seconds))
}

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
