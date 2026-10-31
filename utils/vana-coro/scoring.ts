// Regras do jogo ao vivo do VanaCoro (Family Feud, §3.3–3.5). Puro e com testes.
//
// O estado de uma ronda NUNCA é guardado à mão: é sempre o resultado de repetir o
// registo de ações da ronda (vanacoro_round_events) por esta ordem. Assim o
// "Desfazer" é só marcar a última ação como desfeita e voltar a calcular.
//
//   intro ──start──▶ faceoff ──control──▶ playing ──3 falhas──▶ steal
//                       │                    │                    │
//                       │              quadro limpo          certo/errado
//                       ▼                    ▼                    ▼
//                (revelar/❌/buzz)      reveal_rest ──finish/limpo──▶ round_end
//
// • Duelo: o primeiro capitão a carregar em "Já sei!" ganha a vez. O anfitrião revela
//   o que ele disse (vai para o pote) ou marca ❌ (sem contar para as 3 falhas) e
//   depois dá o controlo a uma equipa.
// • A jogar: cada revelação soma ao pote; cada ❌ conta. 3 falhas → roubo. Quadro todo
//   revelado → a equipa com o controlo ganha o pote.
// • Roubo: a outra equipa tem 1 tentativa. Certo → fica com o pote (mais essa
//   resposta). Errado → o pote vai para a equipa com o controlo.
// • A equipa vencedora recebe pote × multiplicador (a última ronda vale ×2).
// • Depois, o anfitrião revela o resto sem pontos e fecha a ronda.

export type Team = 'a' | 'b'
export type RoundPhase = 'intro' | 'faceoff' | 'playing' | 'steal' | 'reveal_rest' | 'round_end'

export const MAX_STRIKES = 3
export const DEFAULT_ROUNDS = 5
export const MIN_ROUNDS = 3
export const MAX_ROUNDS = 8

/** Prémios no fim do jogo (por jogador). Ajustar aqui à economia da loja. */
export const REWARDS = {
  winner: { xp: 60, gold: 30 },
  loser: { xp: 30, gold: 15 },
} as const

export interface BoardEntryRef {
  id: string
  rank: number
  points: number
}

export type RoundEvent =
  | { kind: 'start' }
  | { kind: 'buzz'; team: Team }
  | { kind: 'reveal'; entryId: string }
  | { kind: 'strike' }
  | { kind: 'control'; team: Team }
  | { kind: 'steal_result'; success: boolean; entryId?: string }
  | { kind: 'finish' }

export interface RevealedEntry {
  /** Pontos da resposta (para mostrar no quadro) */
  points: number
  /** Contou para o pote? (false nas revelações do fim da ronda) */
  scored: boolean
}

export interface RoundState {
  phase: RoundPhase
  buzzedTeam: Team | null
  controlTeam: Team | null
  strikes: number
  /** Conta todos os ❌ (também os do duelo e do roubo falhado) — dispara a animação. */
  strikeSeq: number
  pot: number
  revealed: Record<string, RevealedEntry>
  winner: Team | null
  /** Pontos que a equipa vencedora recebeu nesta ronda (pote × multiplicador). */
  banked: number
}

export function other(team: Team): Team {
  return team === 'a' ? 'b' : 'a'
}

/** A última ronda vale ×2. */
export function roundMultiplier(round: number, totalRounds: number): number {
  return round === totalRounds ? 2 : 1
}

export function initialRoundState(): RoundState {
  return {
    phase: 'intro',
    buzzedTeam: null,
    controlTeam: null,
    strikes: 0,
    strikeSeq: 0,
    pot: 0,
    revealed: {},
    winner: null,
    banked: 0,
  }
}

export function isBoardCleared(state: RoundState, board: BoardEntryRef[]): boolean {
  return board.every((e) => state.revealed[e.id])
}

/** Revela uma resposta; `scored` decide se soma ao pote. */
export function applyReveal(state: RoundState, entry: BoardEntryRef, scored: boolean): RoundState {
  return {
    ...state,
    pot: scored ? state.pot + entry.points : state.pot,
    revealed: { ...state.revealed, [entry.id]: { points: entry.points, scored } },
  }
}

/** Um ❌. Só conta para as 3 falhas quando a equipa com o controlo está a jogar. */
export function applyStrike(state: RoundState): RoundState {
  if (state.phase !== 'playing') return { ...state, strikeSeq: state.strikeSeq + 1 }
  const strikes = state.strikes + 1
  return { ...state, strikes, strikeSeq: state.strikeSeq + 1, phase: strikes >= MAX_STRIKES ? 'steal' : 'playing' }
}

/** A ronda tem vencedor: recebe pote × multiplicador. */
export function bankPot(state: RoundState, winner: Team, multiplier: number, board: BoardEntryRef[]): RoundState {
  const decided = { ...state, winner, banked: state.pot * multiplier }
  return { ...decided, phase: isBoardCleared(decided, board) ? 'round_end' : 'reveal_rest' }
}

/** Resultado do roubo: certo → a outra equipa leva o pote; errado → fica com quem tinha o controlo. */
export function resolveSteal(
  state: RoundState,
  success: boolean,
  entry: BoardEntryRef | null,
  multiplier: number,
  board: BoardEntryRef[],
): RoundState {
  const control = state.controlTeam!
  if (success && entry) return bankPot(applyReveal(state, entry, true), other(control), multiplier, board)
  return bankPot({ ...state, strikeSeq: state.strikeSeq + 1 }, control, multiplier, board)
}

/**
 * Aplica uma ação ao estado. Devolve uma mensagem (string) se a ação não for válida
 * nesta fase — o servidor recusa-a e, ao repetir o registo, ignora-a.
 */
export function applyEvent(
  state: RoundState,
  event: RoundEvent,
  board: BoardEntryRef[],
  multiplier: number,
): RoundState | string {
  const entryOf = (id: string | undefined) => board.find((e) => e.id === id) ?? null

  switch (event.kind) {
    case 'start':
      return state.phase === 'intro' ? { ...state, phase: 'faceoff' } : 'O duelo já começou.'

    case 'buzz':
      if (state.phase !== 'faceoff') return 'Só no duelo.'
      if (state.buzzedTeam) return 'Já carregaram primeiro.'
      return { ...state, buzzedTeam: event.team }

    case 'control':
      if (state.phase !== 'faceoff') return 'O controlo dá-se no fim do duelo.'
      {
        const next: RoundState = { ...state, controlTeam: event.team, phase: 'playing' }
        return isBoardCleared(next, board) ? bankPot(next, event.team, multiplier, board) : next
      }

    case 'reveal': {
      const entry = entryOf(event.entryId)
      if (!entry) return 'Resposta desconhecida.'
      if (state.revealed[entry.id]) return 'Essa resposta já está revelada.'
      if (state.phase === 'faceoff') return applyReveal(state, entry, true)
      if (state.phase === 'playing') {
        const next = applyReveal(state, entry, true)
        return isBoardCleared(next, board) ? bankPot(next, state.controlTeam!, multiplier, board) : next
      }
      if (state.phase === 'reveal_rest') {
        const next = applyReveal(state, entry, false)
        return isBoardCleared(next, board) ? { ...next, phase: 'round_end' } : next
      }
      return state.phase === 'steal' ? 'No roubo usa "Roubo certo" ou "Roubo errado".' : 'Agora não dá para revelar.'
    }

    case 'strike':
      if (state.phase !== 'faceoff' && state.phase !== 'playing') return 'Agora não dá para marcar ❌.'
      return applyStrike(state)

    case 'steal_result': {
      if (state.phase !== 'steal') return 'Não há roubo a decorrer.'
      if (event.success) {
        const entry = entryOf(event.entryId)
        if (!entry || state.revealed[entry.id]) return 'Escolhe a resposta que a equipa acertou.'
        return resolveSteal(state, true, entry, multiplier, board)
      }
      return resolveSteal(state, false, null, multiplier, board)
    }

    case 'finish':
      if (state.phase !== 'reveal_rest') return 'A ronda ainda não tem vencedor.'
      return { ...state, phase: 'round_end' }
  }
}

/** Estado da ronda a partir do registo (as ações inválidas ignoram-se). */
export function replayRound(events: RoundEvent[], board: BoardEntryRef[], multiplier: number): RoundState {
  let state = initialRoundState()
  for (const event of events) {
    const next = applyEvent(state, event, board, multiplier)
    if (typeof next !== 'string') state = next
  }
  return state
}

/** Pontuação das equipas: soma do que cada uma ganhou nas rondas. */
export function teamScores(rounds: { winner: Team | null; banked: number }[]): Record<Team, number> {
  const scores: Record<Team, number> = { a: 0, b: 0 }
  for (const r of rounds) if (r.winner) scores[r.winner] += r.banked
  return scores
}

/** Prémio de um jogador no fim (empate: as duas equipas recebem como vencedoras). */
export function playerReward(team: Team | null, scores: Record<Team, number>): { xp: number; gold: number } | null {
  if (!team) return null
  const tie = scores.a === scores.b
  return tie || scores[team] > scores[other(team)] ? REWARDS.winner : REWARDS.loser
}
