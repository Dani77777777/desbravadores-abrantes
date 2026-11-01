// Presenças por QR (Ecrã do Clube → Presenças): regras puras, partilhadas entre o
// servidor, o telemóvel de quem marca e o projetor.

/** Até quantos minutos depois da hora de início ainda conta como "presente". */
export const CHECKIN_TOLERANCE_MIN = 10

/** O QR muda a cada 30 s; um código continua a servir durante mais 2 trocas (~60–90 s). */
export const CHECKIN_SLOT_MS = 30_000
export const CHECKIN_SLOT_GRACE = 2

/** Depois de ler o QR, a pessoa tem este tempo para entrar na conta ou escrever o nome. */
export const CHECKIN_PASS_MS = 30 * 60 * 1000

/** O QR abre a partir de 3 h antes do início… */
const OPEN_BEFORE_MS = 3 * 60 * 60 * 1000
/** …e fecha 1 h depois do fim (ou 12 h depois do início, se o evento não tiver fim). */
const CLOSE_AFTER_END_MS = 60 * 60 * 1000
const CLOSE_AFTER_START_MS = 12 * 60 * 60 * 1000

export const CHECKIN_PASS_COOKIE = 'presenca_pass'
export const CHECKIN_ENTER_PATH = '/presenca/entrar'

export type CheckinStatus = 'presente' | 'atrasado'

export type CheckinEvent = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  target_section: string | null
  is_finished: boolean
}

/** "presente" até 10 min depois da hora de início; depois disso, "atrasado" (é só uma sugestão no rascunho). */
export function checkinStatus(startAt: string, now = Date.now()): CheckinStatus {
  return now <= new Date(startAt).getTime() + CHECKIN_TOLERANCE_MIN * 60_000 ? 'presente' : 'atrasado'
}

/** Ainda se pode marcar presença neste evento? */
export function checkinOpen(e: Pick<CheckinEvent, 'start_at' | 'end_at' | 'is_finished'>, now = Date.now()): boolean {
  if (e.is_finished) return false
  const start = new Date(e.start_at).getTime()
  const close = e.end_at ? new Date(e.end_at).getTime() + CLOSE_AFTER_END_MS : start + CLOSE_AFTER_START_MS
  return now >= start - OPEN_BEFORE_MS && now <= close
}

export function checkinSlot(now = Date.now()): number {
  return Math.floor(now / CHECKIN_SLOT_MS)
}

/** O código do QR pertence a uma troca recente? (o resto da validação é a assinatura, no servidor) */
export function slotIsFresh(slot: number, now = Date.now()): boolean {
  const current = checkinSlot(now)
  return Number.isInteger(slot) && slot <= current && slot >= current - CHECKIN_SLOT_GRACE
}

/** Nome de um convidado: espaços arrumados, 2 a 40 letras. */
export function cleanGuestName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length >= 2 && name.length <= 40 ? name : null
}

// ── Convidado neste telemóvel ──────────────────────────────────
// Depois de registar a presença, o telemóvel do convidado guarda quem ele é. Serve para
// o VanaCoro o reconhecer e o pôr logo na família certa.

export const CHECKIN_GUEST_STORAGE_KEY = 'presenca:convidado'

export type StoredCheckinGuest = { eventId: string; guestId: string; secret: string; name: string; at: number }

export function readStoredGuest(): StoredCheckinGuest | null {
  try {
    const raw = localStorage.getItem(CHECKIN_GUEST_STORAGE_KEY)
    const g = raw ? (JSON.parse(raw) as StoredCheckinGuest) : null
    // Os convidados apagam-se, no máximo, uns dias depois do evento.
    return g && typeof g.guestId === 'string' && typeof g.secret === 'string' && Date.now() - g.at < 3 * 86400000 ? g : null
  } catch {
    return null
  }
}

export function storeGuest(g: StoredCheckinGuest) {
  try {
    localStorage.setItem(CHECKIN_GUEST_STORAGE_KEY, JSON.stringify(g))
  } catch {
    /* modo privado: o convidado escolhe o nome na lista quando entrar no jogo */
  }
}

// ── Ids nas ferramentas (Sorteador, Formador de equipas) ───────
// Os convidados que marcaram pelo QR entram como visitas com um id próprio
// (começa por "guest:", como as visitas escritas à mão).

export const CHECKIN_GUEST_PREFIX = 'guest:checkin:'

export function checkinGuestEntryId(guestId: string) {
  return `${CHECKIN_GUEST_PREFIX}${guestId}`
}

export function checkinGuestIdFromEntry(entryId: string): string | null {
  return entryId.startsWith(CHECKIN_GUEST_PREFIX) ? entryId.slice(CHECKIN_GUEST_PREFIX.length) : null
}
