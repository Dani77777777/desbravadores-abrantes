// Utilitários partilhados pela gestão de eventos e pela visão geral.

export const TZ = 'Europe/Lisbon'

export const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

/** Cor sólida de cada classe (igual às cores usadas no resto do site). */
export const SECTION_SOLID: Record<string, string> = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

export interface AttendanceRow {
  event_id: string
  user_id: string
  status: 'presente' | 'atrasado' | 'faltou'
}

export interface AttendanceStats {
  present: number
  late: number
  absent: number
  total: number
  /** (presentes + atrasados) / total, 0–100; null se ainda não há registos. */
  rate: number | null
}

/** Presenças agregadas por evento. */
export function attendanceByEvent(rows: AttendanceRow[]): Map<string, AttendanceStats> {
  const map = new Map<string, AttendanceStats>()
  for (const r of rows) {
    const s = map.get(r.event_id) ?? { present: 0, late: 0, absent: 0, total: 0, rate: null }
    if (r.status === 'presente') s.present++
    else if (r.status === 'atrasado') s.late++
    else s.absent++
    s.total++
    map.set(r.event_id, s)
  }
  for (const s of map.values()) s.rate = s.total ? Math.round(((s.present + s.late) / s.total) * 100) : null
  return map
}

/** Média das taxas de presença (só eventos com registos). */
export function averageRate(stats: Iterable<AttendanceStats>): number | null {
  const rates = [...stats].map((s) => s.rate).filter((r): r is number => r !== null)
  return rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null
}

/** "03/10, 18:00" */
export function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

/** "sábado, 3 de outubro às 18:00" (para comunicados) */
export function fmtLong(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export function fmtParts(iso: string) {
  const d = new Date(iso)
  return {
    day: d.toLocaleString('pt-PT', { day: 'numeric', timeZone: TZ }),
    month: d.toLocaleString('pt-PT', { month: 'short', timeZone: TZ }).replace('.', ''),
    weekday: d.toLocaleString('pt-PT', { weekday: 'short', timeZone: TZ }).replace('.', ''),
    time: d.toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
  }
}

/**
 * Valor para um <input type="datetime-local"> na hora LOCAL do browser.
 * (toISOString().slice(0,16) dava a hora UTC — 1h de diferença no verão.)
 */
export function toLocalInput(value: string | Date) {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Dias entre hoje e a data (0 = hoje), contando dias de calendário. */
export function daysUntil(iso: string, now: number) {
  const a = new Date(now); a.setHours(0, 0, 0, 0)
  const b = new Date(iso); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function relativeDayLabel(days: number) {
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  if (days === -1) return 'Ontem'
  if (days < 0) return `Há ${-days} dias`
  return `Em ${days} dias`
}
