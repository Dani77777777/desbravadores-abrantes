'use client'

// localStorage do VanaSentinela (recorde local dos visitantes e preferência de som).
// Sempre dentro de try/catch: em modo privado guarda-se só em memória e o jogo
// funciona na mesma.

import { useSyncExternalStore } from 'react'

const EVENTO = 'vana-sentinela-storage'
const memoria = new Map<string, string>()

export function lerGuardado(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return v
  } catch {
    /* sem localStorage */
  }
  return memoria.get(key) ?? null
}

export function guardar(key: string, value: string) {
  memoria.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    /* sem localStorage: fica em memória */
  }
  window.dispatchEvent(new Event(EVENTO))
}

function subscrever(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENTO, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENTO, cb)
  }
}

/** Valor guardado (null no servidor e enquanto não houver nada). */
export function useGuardado(key: string): string | null {
  return useSyncExternalStore(subscrever, () => lerGuardado(key), () => null)
}

/** Número positivo guardado, ou null. */
export function useNumeroGuardado(key: string): number | null {
  const v = Number(useGuardado(key))
  return Number.isFinite(v) && v > 0 ? v : null
}

function subscreverMovimento(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** prefers-reduced-motion: sem voo da carta, só fade. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscreverMovimento,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}
