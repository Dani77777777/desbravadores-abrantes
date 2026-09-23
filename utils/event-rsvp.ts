// Confirmação de presença ("Vou / Não vou") nos eventos que a pedem.
// É só a intenção do membro — a presença real é validada pela liderança (event_attendance).

export type RsvpEvent = {
  id: string
  start_at: string
  is_finished?: boolean | null
  rsvp_enabled?: boolean | null
  rsvp_deadline?: string | null
}

export type RsvpRow = { event_id: string; user_id: string; going: boolean }

/** Até quando se pode responder: o prazo, ou o início do evento. */
export function rsvpClosesAt(e: RsvpEvent): number {
  return new Date(e.rsvp_deadline || e.start_at).getTime()
}

export function isRsvpOpen(e: RsvpEvent, now: number): boolean {
  return !!e.rsvp_enabled && !e.is_finished && now < rsvpClosesAt(e)
}

/** Eventos à espera da resposta do membro (pedem confirmação, ainda abertos, sem resposta). */
export function pendingRsvpCount(events: RsvpEvent[], answered: Set<string>, now = Date.now()): number {
  return events.filter((e) => isRsvpOpen(e, now) && !answered.has(e.id)).length
}

export type RsvpSummary = { going: string[]; notGoing: string[]; noAnswer: string[] }

/** Respostas de um evento, a partir de quem é público dele (`audienceIds`). */
export function summarizeRsvps(eventId: string, rows: RsvpRow[], audienceIds: string[]): RsvpSummary {
  const answers = new Map(rows.filter((r) => r.event_id === eventId).map((r) => [r.user_id, r.going]))
  const going: string[] = []
  const notGoing: string[] = []
  const noAnswer: string[] = []
  for (const id of audienceIds) {
    const a = answers.get(id)
    if (a === true) going.push(id)
    else if (a === false) notGoing.push(id)
    else noAnswer.push(id)
  }
  // Quem respondeu mas já não está no público (mudou de secção) continua a contar
  for (const [id, a] of answers) {
    if (audienceIds.includes(id)) continue
    ;(a ? going : notGoing).push(id)
  }
  return { going, notGoing, noAnswer }
}

/** Ordem na lista de presenças: disse que ia → sem resposta → disse que não ia. */
export function rsvpRank(answer: boolean | undefined): number {
  return answer === true ? 0 : answer === undefined ? 1 : 2
}

/** "sáb., 12/10 às 18:00" */
export function fmtRsvpDeadline(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Lisbon' })
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
  return `${day} às ${time}`
}
