// Sorteador (Ferramentas da gestão): lógica pura, partilhada entre o telemóvel e o projetor.

import { shortDisplayName } from '@/utils/display-name'

export type RaffleMember = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  section: string | null
  leadership_section: string | null
  helper_role: string | null
  helper_section: string | null
}

export type RaffleEvent = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  target_section: string | null
  is_finished: boolean
}

/** Uma pessoa dentro do sorteio (membro ou visita escrita à mão). */
export type RaffleEntry = {
  id: string
  name: string
  avatar: string | null
}

/** Estado sincronizado com o projetor (tabela `raffle_screens.state`). */
export type RaffleScreenState = {
  title: string | null
  /** Nomes em jogo enquanto se prepara o sorteio (para o projetor mostrar). */
  pool: RaffleEntry[]
  draw: RaffleDraw | null
}

export type RaffleDraw = {
  id: string
  /** Quem estava no sorteio — usado para os nomes que passam no rolo. */
  pool: RaffleEntry[]
  winners: RaffleEntry[]
  /** O anfitrião carregou em "revelar todos". */
  revealAll: boolean
}

/**
 * Janela do projetor no MESMO computador: fala com o sorteador por BroadcastChannel
 * (instantâneo, sem base de dados).
 *   projetor → sorteador: hello (pede o estado), ping (a cada 2s), bye
 *   sorteador → projetor: state, bye
 */
export type RaffleLocalMessage =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'bye'; from: 'projector' | 'controller' }
  | { type: 'state'; state: RaffleScreenState }

export function raffleLocalChannelName(userId: string) {
  return `raffle-local-${userId}`
}

export const PROJECTOR_PATH = '/admin/ferramentas/sorteio/projetor'
export const PROJECTOR_WINDOW_NAME = 'sorteio-projetor'

export const GUEST_PREFIX = 'guest:'

export function isGuestId(id: string) {
  return id.startsWith(GUEST_PREFIX)
}

export function memberEntry(m: RaffleMember): RaffleEntry {
  return { id: m.id, name: shortDisplayName(m.full_name, 'Membro'), avatar: m.avatar_url }
}

/**
 * "Remover dirigentes": quem é responsável pelo contexto do sorteio.
 *   - Evento geral (sem secção)  → coordenadores.
 *   - Evento de uma secção       → dirigentes dessa secção.
 *   - Sem evento                 → qualquer dirigente ou coordenador.
 * Usa o cargo REAL (os ajudantes têm o seu próprio atalho).
 */
export function isLeaderFor(m: RaffleMember, event: RaffleEvent | null): boolean {
  if (!event) return m.role === 'coordenador' || m.role === 'dirigente'
  if (!event.target_section) return m.role === 'coordenador'
  return m.role === 'dirigente' && m.leadership_section === event.target_section
}

/** "Remover ajudantes": mesma regra de contexto, mas para helper_role/helper_section. */
export function isHelperFor(m: RaffleMember, event: RaffleEvent | null): boolean {
  if (!m.helper_role) return false
  if (!event) return true
  if (!event.target_section) return m.helper_role === 'coordenador'
  return m.helper_role === 'dirigente' && m.helper_section === event.target_section
}

const RECOMMEND_BEFORE_MS = 3 * 60 * 60 * 1000 // começa daqui a menos de 3h
const RECOMMEND_AFTER_MS = 12 * 60 * 60 * 1000 // ou começou há menos de 12h

/** Evento a decorrer (ou prestes a começar) mais próximo de agora. */
export function recommendEvent(events: RaffleEvent[], now = Date.now()): RaffleEvent | null {
  let best: RaffleEvent | null = null
  let bestDist = Infinity
  for (const e of events) {
    const start = new Date(e.start_at).getTime()
    const end = e.end_at ? new Date(e.end_at).getTime() : null
    const ongoing = end !== null && start <= now && now <= end
    const near = start - now <= RECOMMEND_BEFORE_MS && now - start <= RECOMMEND_AFTER_MS
    if (!ongoing && !near) continue
    const dist = Math.abs(start - now)
    if (dist < bestDist) {
      best = e
      bestDist = dist
    }
  }
  return best
}

function randomInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Rejeição para evitar enviesamento do módulo
    const limit = Math.floor(0x100000000 / max) * max
    const buf = new Uint32Array(1)
    do crypto.getRandomValues(buf)
    while (buf[0] >= limit)
    return buf[0] % max
  }
  return Math.floor(Math.random() * max)
}

/** Escolhe `count` pessoas diferentes ao acaso (Fisher–Yates parcial). */
export function pickWinners<T>(pool: T[], count: number): T[] {
  const arr = [...pool]
  const n = Math.min(count, arr.length)
  for (let i = 0; i < n; i++) {
    const j = i + randomInt(arr.length - i)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Iniciais para o avatar de reserva. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
