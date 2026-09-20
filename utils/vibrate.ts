/**
 * Wrapper around the Web Vibration API.
 *
 * Suporte:
 *   ✓ Android Chrome / Firefox / Edge / Samsung Internet
 *   ✓ Desktop Chrome / Edge (silencioso, sem efeito)
 *   ✗ iOS Safari / Chrome no iPhone (Apple não suporta — limitação da plataforma)
 *
 * Devolve `true` se o pedido foi enviado ao browser, `false` se a API não existe.
 */

export type VibrationPattern = 'short' | 'alert' | 'urgent' | 'night_call'

const PATTERNS: Record<VibrationPattern, number | number[]> = {
  short: 200,
  alert: [200, 100, 200],
  urgent: [400, 100, 400, 100, 400],
  night_call: [300, 200, 300, 200, 600],
}

export function vibrate(pattern: VibrationPattern | number | number[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false
  }
  const value = typeof pattern === 'string' ? PATTERNS[pattern] : pattern
  try {
    return navigator.vibrate(value)
  } catch {
    return false
  }
}

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}
