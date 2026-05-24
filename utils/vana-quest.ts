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

/**
 * Calcula o tamanho da fonte da pergunta com base no comprimento do texto.
 * Quanto maior o texto, menor a fonte — para evitar que faça overflow.
 * Retorna uma string CSS clamp() pronta para usar.
 */
export function questionFontSize(text: string): string {
  const len = (text || '').length
  if (len <= 40) return 'clamp(2.5rem, 6.5vw, 7rem)'
  if (len <= 70) return 'clamp(2.25rem, 5vw, 5.5rem)'
  if (len <= 110) return 'clamp(1.75rem, 4vw, 4.5rem)'
  if (len <= 160) return 'clamp(1.5rem, 3.2vw, 3.75rem)'
  if (len <= 220) return 'clamp(1.25rem, 2.6vw, 3rem)'
  return 'clamp(1.1rem, 2.2vw, 2.5rem)'
}

/**
 * Tamanho de fonte para o texto de cada opção (presentation question_active).
 * Considera o texto mais longo das opções para dimensionar todas igualmente.
 */
export function optionFontSize(longestText: string): string {
  const len = (longestText || '').length
  if (len <= 15) return 'clamp(1.75rem, 3.5vw, 4rem)'
  if (len <= 30) return 'clamp(1.5rem, 3vw, 3.25rem)'
  if (len <= 50) return 'clamp(1.25rem, 2.5vw, 2.5rem)'
  if (len <= 80) return 'clamp(1.1rem, 2vw, 2rem)'
  return 'clamp(1rem, 1.6vw, 1.5rem)'
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
