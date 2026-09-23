// Cronómetro (Ferramentas da gestão): lógica pura, partilhada entre o controlo e o projetor.

export type TimerMode = 'countdown' | 'stopwatch' | 'laps' | 'rounds'

export type TimerConfig = {
  mode: TimerMode
  title: string
  /** Contagem decrescente. */
  durationMs: number
  /** Sequência de rondas: `count` rondas de `workMs` com `restMs` de pausa entre elas. */
  rounds: { workMs: number; restMs: number; count: number }
  /** Voltas por equipa: nomes escritos antes de começar. */
  teams: string[]
}

/** Tempo de uma equipa que terminou (modo "Equipas"). */
export type TimerLap = { team: string; ms: number }

/**
 * Estado enviado ao projetor. O relógio é "tempo decorrido no momento do envio + se
 * está a correr" — não horas absolutas — porque o relógio do telemóvel e o do
 * computador do projetor podem não bater certo. Quem recebe soma o tempo desde que
 * recebeu. Só muda em iniciar/pausar/reiniciar/marcar, não a cada segundo.
 */
export type TimerScreenState = {
  config: TimerConfig
  /** Muda a cada reinício (para o projetor não tocar o alarme de um tempo antigo). */
  runId: string
  running: boolean
  elapsedMs: number
  sentAt: number
  laps: TimerLap[]
}

/** Janela do projetor no mesmo computador (BroadcastChannel), igual ao Sorteador. */
export type TimerLocalMessage =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'bye'; from: 'projector' | 'controller' }
  | { type: 'state'; state: TimerScreenState }

export function timerLocalChannelName(userId: string) {
  return `timer-local-${userId}`
}

export const TIMER_PROJECTOR_PATH = '/admin/ferramentas/cronometro/projetor'
export const TIMER_PROJECTOR_WINDOW_NAME = 'cronometro-projetor'

export const WARN_MS = 10_000
export const MAX_TEAMS = 12
export const MAX_ROUNDS = 20

export const MODE_LABELS: Record<TimerMode, string> = {
  countdown: 'Contagem',
  stopwatch: 'Cronómetro',
  laps: 'Equipas',
  rounds: 'Rondas',
}

export const DEFAULT_CONFIG: TimerConfig = {
  mode: 'countdown',
  title: '',
  durationMs: 5 * 60_000,
  rounds: { workMs: 2 * 60_000, restMs: 30_000, count: 3 },
  teams: [],
}

export type TimerPhase = { kind: 'work' | 'rest'; round: number; startMs: number; durationMs: number }

/** Fases de uma sequência de rondas: ronda, pausa, ronda, …, ronda (sem pausa no fim). */
export function roundPhases(rounds: TimerConfig['rounds']): TimerPhase[] {
  const phases: TimerPhase[] = []
  let t = 0
  const count = Math.max(1, rounds.count)
  for (let i = 1; i <= count; i++) {
    phases.push({ kind: 'work', round: i, startMs: t, durationMs: rounds.workMs })
    t += rounds.workMs
    if (i < count && rounds.restMs > 0) {
      phases.push({ kind: 'rest', round: i, startMs: t, durationMs: rounds.restMs })
      t += rounds.restMs
    }
  }
  return phases
}

/** Duração total de um modo com fim (contagem/rondas); `null` nos modos que só sobem. */
export function totalDurationMs(config: TimerConfig): number | null {
  if (config.mode === 'countdown') return config.durationMs
  if (config.mode === 'rounds') {
    const phases = roundPhases(config.rounds)
    const last = phases[phases.length - 1]
    return last.startMs + last.durationMs
  }
  return null
}

export type TimerView = {
  /** Número grande no ecrã (ms): o que falta nos modos que descem, o decorrido nos que sobem. */
  displayMs: number
  countsDown: boolean
  /** 1 → 0 no anel de progresso; `null` sem anel. */
  progress: number | null
  /** Últimos 10 s de uma contagem/fase. */
  warn: boolean
  done: boolean
  /** "Ronda 2 de 3" / "Pausa". */
  phaseLabel: string | null
  phaseKind: 'work' | 'rest' | null
  /** Identifica a fase atual (para tocar um sinal quando muda). */
  phaseKey: string
}

export function timerView(config: TimerConfig, elapsedMs: number): TimerView {
  const elapsed = Math.max(0, elapsedMs)
  if (config.mode === 'countdown') {
    const total = Math.max(1, config.durationMs)
    const remaining = Math.max(0, total - elapsed)
    return {
      displayMs: remaining,
      countsDown: true,
      progress: remaining / total,
      warn: remaining > 0 && remaining <= WARN_MS,
      done: remaining <= 0,
      phaseLabel: null,
      phaseKind: null,
      phaseKey: 'countdown',
    }
  }
  if (config.mode === 'rounds') {
    const phases = roundPhases(config.rounds)
    const count = phases.filter((p) => p.kind === 'work').length
    const last = phases[phases.length - 1]
    const total = last.startMs + last.durationMs
    if (elapsed >= total) {
      return {
        displayMs: 0,
        countsDown: true,
        progress: 0,
        warn: false,
        done: true,
        phaseLabel: `Ronda ${count} de ${count}`,
        phaseKind: 'work',
        phaseKey: 'done',
      }
    }
    const phase = phases.find((p) => elapsed < p.startMs + p.durationMs) ?? last
    const remaining = phase.startMs + phase.durationMs - elapsed
    return {
      displayMs: remaining,
      countsDown: true,
      progress: remaining / Math.max(1, phase.durationMs),
      warn: remaining <= WARN_MS,
      done: false,
      phaseLabel: phase.kind === 'work' ? `Ronda ${phase.round} de ${count}` : 'Pausa',
      phaseKind: phase.kind,
      phaseKey: `${phase.kind}-${phase.round}`,
    }
  }
  return {
    displayMs: elapsed,
    countsDown: false,
    progress: null,
    warn: false,
    done: false,
    phaseLabel: null,
    phaseKind: null,
    phaseKey: config.mode,
  }
}

/**
 * Formata o tempo. Ao descer arredonda para cima (mostra 0:01 até ao fim do último
 * segundo); ao subir mostra também as décimas (útil para comparar equipas).
 */
export function formatTimer(ms: number, opts: { countsDown: boolean; tenths?: boolean }): string {
  const safe = Math.max(0, ms)
  const totalSec = opts.countsDown ? Math.ceil(safe / 1000) : Math.floor(safe / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  if (!opts.tenths || opts.countsDown) return base
  return `${base}.${Math.floor((safe % 1000) / 100)}`
}

/** Tempo decorrido agora, a partir de um estado recebido e da hora local em que "vale". */
export function elapsedAt(state: Pick<TimerScreenState, 'running' | 'elapsedMs'>, anchor: number, now: number): number {
  return state.elapsedMs + (state.running ? Math.max(0, now - anchor) : 0)
}

/** Equipas ordenadas: primeiro as que já terminaram (pelo tempo), depois as que faltam. */
export function lapRanking(teams: string[], laps: TimerLap[]): { team: string; ms: number | null; place: number | null }[] {
  const done = [...laps].sort((a, b) => a.ms - b.ms)
  const doneSet = new Set(done.map((l) => l.team))
  return [
    ...done.map((l, i) => ({ team: l.team, ms: l.ms, place: i + 1 })),
    ...teams.filter((t) => !doneSet.has(t)).map((t) => ({ team: t, ms: null, place: null })),
  ]
}

export function newTimerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
