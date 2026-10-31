// Ritmo da "Pergunta da Semana" (§2.3): estado de cada pergunta e "Agendar fila".
//
// Uma pergunta está aberta quando opens_at <= agora < closes_at: calcula-se na
// hora, sem cron. As aberturas são sempre às 18:00 de Lisboa; o servidor corre
// em UTC, por isso as contas de dias fazem-se no calendário de Lisboa (a hora
// de verão muda o desvio, mas a pergunta abre sempre às 18:00 locais).

const TZ = 'Europe/Lisbon'
export const OPEN_HOUR = 18

export const NORMAL_RHYTHM = { cadence_days: 7, open_days: 7 } as const
export const TURBO_RHYTHM = { cadence_days: 3, open_days: 5 } as const

export type QuestionStatus = 'queued' | 'scheduled' | 'open' | 'review' | 'ready' | 'played'

export interface QuestionTiming {
  opens_at: string | null
  closes_at: string | null
  review_status: string
  used_at: string | null
}

export function questionStatus(q: QuestionTiming, now: Date = new Date()): QuestionStatus {
  if (q.used_at) return 'played'
  if (q.review_status === 'ready') return 'ready'
  if (!q.opens_at || !q.closes_at) return 'queued'
  if (now < new Date(q.opens_at)) return 'scheduled'
  if (now < new Date(q.closes_at)) return 'open'
  return 'review'
}

export function isQuestionOpen(q: Pick<QuestionTiming, 'opens_at' | 'closes_at'>, now: Date = new Date()): boolean {
  return !!q.opens_at && !!q.closes_at && new Date(q.opens_at) <= now && now < new Date(q.closes_at)
}

/** Dia do calendário em Lisboa, em YYYY-MM-DD. */
export function lisbonDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Desvio de Lisboa em relação a UTC naquele instante, em minutos (0 ou 60). */
function lisbonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asIfUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

/** Instante de `date` (YYYY-MM-DD) às `hour`:00 em Lisboa. */
export function lisbonAt(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour)
  // Duas passagens: o desvio certo é o do próprio instante, não o da estimativa.
  let at = new Date(guess - lisbonOffsetMinutes(new Date(guess)) * 60000)
  at = new Date(guess - lisbonOffsetMinutes(at) * 60000)
  return at
}

export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** Próximas 18:00 de Lisboa a seguir a `now` (hoje, se ainda não passou). */
export function nextOpening(now: Date): Date {
  const today = lisbonAt(lisbonDate(now), OPEN_HOUR)
  return today > now ? today : lisbonAt(addDays(lisbonDate(now), 1), OPEN_HOUR)
}

/** Fecho de uma pergunta que abre em `opensAt`: `openDays` dias depois, à mesma hora de Lisboa. */
export function closingFor(opensAt: Date, openDays: number): Date {
  return lisbonAt(addDays(lisbonDate(opensAt), openDays), OPEN_HOUR)
}

export interface QueueItem {
  id: string
  opens_at: string | null
  created_at: string
}

export interface ScheduledSlot {
  id: string
  opens_at: string
  closes_at: string
}

/**
 * "Agendar fila": dá data às perguntas sem data, por ordem de criação. Cada uma abre
 * `cadence_days` depois da última abertura (agendada ou já passada), às 18:00 de
 * Lisboa, e fica aberta `open_days`. Se essa data já passou, abre nas próximas 18:00.
 */
export function scheduleQueue(
  questions: QueueItem[],
  rhythm: { cadence_days: number; open_days: number },
  now: Date = new Date(),
): ScheduledSlot[] {
  const dated = questions.filter((q) => q.opens_at).map((q) => new Date(q.opens_at!).getTime())
  let anchor: Date | null = dated.length ? new Date(Math.max(...dated)) : null

  const queued = questions
    .filter((q) => !q.opens_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  return queued.map((q) => {
    let opens = anchor ? lisbonAt(addDays(lisbonDate(anchor), rhythm.cadence_days), OPEN_HOUR) : nextOpening(now)
    if (opens <= now) opens = nextOpening(now)
    anchor = opens
    return { id: q.id, opens_at: opens.toISOString(), closes_at: closingFor(opens, rhythm.open_days).toISOString() }
  })
}
