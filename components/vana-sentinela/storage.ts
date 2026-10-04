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

function novoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Browsers antigos / http: UUID v4 à mão
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Id anónimo deste browser para o ranking dos convidados (cria-o na primeira vez). */
export function obterConvidadoId(key: string): string {
  const atual = lerGuardado(key)
  if (atual && /^[0-9a-f-]{36}$/i.test(atual)) return atual
  const novo = novoUuid()
  guardar(key, novo)
  return novo
}
