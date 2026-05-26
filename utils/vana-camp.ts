/**
 * Regras puras (sem I/O) do jogo VanaCamp: Infiltrados.
 *
 * Funções aqui dentro:
 *   - rolesDistribution(n)         → contagens sugeridas por nº de jogadores
 *   - assignRoles(players, config) → sorteio com seed opcional
 *   - resolveNight(actions, ...)   → calcula quem foi sabotado e se houve save
 *   - tallyVotes(votes, mayorId)   → conta votos com tiebreak do Mayor
 *   - checkWinCondition(players)   → retorna lado vencedor ou null
 *   - generateSessionCode()        → 6 chars alfanuméricos
 */

import type {
  VanaCampRole,
  VanaCampRoleConfig,
  VanaCampSide,
  VanaCampNightAction,
  VanaCampVote,
} from '@/types/vana-camp'

// ============================================
// DISTRIBUIÇÃO DE PAPÉIS
// ============================================

/**
 * Sugestão de distribuição baseada no número de jogadores.
 * Profeta e Conselheiro são sempre 1 cada (quando há jogadores suficientes).
 * O Mayor é um atributo separado, não conta aqui.
 *
 * @throws Error se n < 4 (mínimo viável)
 */
export function rolesDistribution(n: number): VanaCampRoleConfig {
  if (n < 4) {
    throw new Error('VanaCamp requer no mínimo 4 jogadores.')
  }

  // Nº de infiltrados ≈ ceil(n / 4), capado para não ultrapassar metade dos bons
  let infiltrators: number
  if (n <= 6) infiltrators = 1
  else if (n <= 9) infiltrators = 2
  else if (n <= 14) infiltrators = 3
  else if (n <= 19) infiltrators = 4
  else infiltrators = 5

  const seer = 1
  const guardian = 1
  const villagers = n - infiltrators - seer - guardian

  if (villagers < 1) {
    // Fallback p/ grupos muito pequenos: corta Guardian primeiro
    return { infiltrators, seer: 1, guardian: 0, villagers: n - infiltrators - 1 }
  }

  return { infiltrators, seer, guardian, villagers }
}

/**
 * Valida que uma config de papéis bate certo com o nº de jogadores.
 */
export function validateRoleConfig(config: VanaCampRoleConfig, playerCount: number): string | null {
  const total = config.infiltrators + config.seer + config.guardian + config.villagers
  if (total !== playerCount) {
    return `A distribuição soma ${total} mas há ${playerCount} jogadores.`
  }
  if (config.infiltrators < 1) return 'Tem de haver pelo menos 1 Infiltrado.'
  if (config.infiltrators >= playerCount - config.infiltrators) {
    return 'Infiltrados não podem ser metade ou mais do total.'
  }
  if (config.seer < 0 || config.guardian < 0 || config.villagers < 0) {
    return 'Contagens não podem ser negativas.'
  }
  return null
}

// ============================================
// LADO (good/bad)
// ============================================

export function sideOf(role: VanaCampRole): VanaCampSide {
  return role === 'infiltrator' ? 'infiltrators' : 'desbravadores'
}

// ============================================
// SORTEIO
// ============================================

/**
 * PRNG mulberry32 — determinista quando recebe seed.
 * Permite re-sortear de forma reproduzível em testes.
 */
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Atribui papéis a uma lista de jogadores (por id) segundo a config.
 * Retorna um mapa playerId → role.
 *
 * @param playerIds  IDs dos jogadores na sessão
 * @param config     Contagens por papel (deve somar com playerIds.length)
 * @param seed       Opcional, para sorteio reproduzível
 */
export function assignRoles(
  playerIds: string[],
  config: VanaCampRoleConfig,
  seed?: number,
): Map<string, VanaCampRole> {
  const error = validateRoleConfig(config, playerIds.length)
  if (error) throw new Error(error)

  const pool: VanaCampRole[] = [
    ...Array<VanaCampRole>(config.infiltrators).fill('infiltrator'),
    ...Array<VanaCampRole>(config.seer).fill('seer'),
    ...Array<VanaCampRole>(config.guardian).fill('guardian'),
    ...Array<VanaCampRole>(config.villagers).fill('villager'),
  ]

  const rng = makeRng(seed)
  const shuffled = shuffle(pool, rng)
  const result = new Map<string, VanaCampRole>()
  playerIds.forEach((pid, i) => result.set(pid, shuffled[i]))
  return result
}

// ============================================
// RESOLUÇÃO DA NOITE
// ============================================

export interface NightResolution {
  /** Jogador alvo escolhido pelos infiltrados (id), ou null se não houve consenso. */
  sabotage_target_id: string | null
  /** Jogador protegido pelo Conselheiro nessa noite, ou null. */
  guardian_target_id: string | null
  /** True se a sabotagem foi bloqueada pela proteção do Conselheiro. */
  saved: boolean
  /** Jogador efetivamente eliminado (null se sabotagem falhou ou não houve consenso). */
  killed_player_id: string | null
}

/**
 * Calcula o resultado da noite.
 *
 * Regras:
 *   - Cada infiltrado vota num alvo (ações com phase='infiltrators').
 *     O mais votado é o alvo. Em caso de empate, a ação mais antiga prevalece.
 *   - O Conselheiro escolhe alguém para proteger (phase='guardian').
 *   - Se Conselheiro protegeu o alvo escolhido pelos infiltrados → sabotagem falha.
 *   - Caso contrário, o alvo é eliminado.
 *
 * @param actions  Ações registadas para o `day_number` da noite a resolver
 */
export function resolveNight(actions: VanaCampNightAction[]): NightResolution {
  const infiltratorVotes = actions.filter((a) => a.phase === 'infiltrators')
  const guardianAction = actions.find((a) => a.phase === 'guardian') ?? null

  // Contar votos dos infiltrados
  const tally = new Map<string, { count: number; earliest: string }>()
  for (const v of infiltratorVotes) {
    const existing = tally.get(v.target_player_id)
    if (!existing) {
      tally.set(v.target_player_id, { count: 1, earliest: v.created_at })
    } else {
      existing.count += 1
      if (v.created_at < existing.earliest) existing.earliest = v.created_at
    }
  }

  let sabotage_target_id: string | null = null
  if (tally.size > 0) {
    const sorted = [...tally.entries()].sort(([, a], [, b]) => {
      if (b.count !== a.count) return b.count - a.count
      return a.earliest.localeCompare(b.earliest)
    })
    sabotage_target_id = sorted[0][0]
  }

  const guardian_target_id = guardianAction?.target_player_id ?? null
  const saved = sabotage_target_id !== null && sabotage_target_id === guardian_target_id

  return {
    sabotage_target_id,
    guardian_target_id,
    saved,
    killed_player_id: saved ? null : sabotage_target_id,
  }
}

// ============================================
// CONTAGEM DE VOTOS (DIA)
// ============================================

export interface VoteTally {
  /** target_player_id → nº de votos (Mayor já conta como 2 quando aplicável). */
  counts: Record<string, number>
  /** Vencedor da votação (target_player_id) ou null se empate sem resolução. */
  winner_id: string | null
  /** True se o desempate do Mayor foi necessário e aplicado. */
  mayor_tiebreak_used: boolean
}

/**
 * Conta votos de expulsão diária. O Mayor (se vivo) vale 2 votos APENAS em caso
 * de empate, e só se o próprio Mayor tiver votado num dos empatados.
 *
 * @param votes      Votos do dia (vote_type='day_expulsion')
 * @param mayorId    voter_player_id do Mayor (vivo), ou null
 */
export function tallyVotes(votes: VanaCampVote[], mayorId: string | null): VoteTally {
  const counts: Record<string, number> = {}
  for (const v of votes) {
    counts[v.target_player_id] = (counts[v.target_player_id] ?? 0) + 1
  }

  if (Object.keys(counts).length === 0) {
    return { counts, winner_id: null, mayor_tiebreak_used: false }
  }

  const max = Math.max(...Object.values(counts))
  const tied = Object.entries(counts)
    .filter(([, c]) => c === max)
    .map(([id]) => id)

  if (tied.length === 1) {
    return { counts, winner_id: tied[0], mayor_tiebreak_used: false }
  }

  // Empate — tentar desempate do Mayor
  if (mayorId) {
    const mayorVote = votes.find((v) => v.voter_player_id === mayorId)
    if (mayorVote && tied.includes(mayorVote.target_player_id)) {
      const adjusted = { ...counts, [mayorVote.target_player_id]: counts[mayorVote.target_player_id] + 1 }
      return { counts: adjusted, winner_id: mayorVote.target_player_id, mayor_tiebreak_used: true }
    }
  }

  return { counts, winner_id: null, mayor_tiebreak_used: false }
}

// ============================================
// CONDIÇÃO DE VITÓRIA
// ============================================

export interface PlayerSnapshot {
  id: string
  role: VanaCampRole
  is_alive: boolean
}

/**
 * Verifica condição de vitória.
 * - Infiltrados ganham quando #infiltrados_vivos >= #fiéis_vivos
 * - Fiéis ganham quando #infiltrados_vivos == 0
 * Retorna null se o jogo continua.
 */
export function checkWinCondition(players: PlayerSnapshot[]): VanaCampSide | null {
  const alive = players.filter((p) => p.is_alive)
  const infiltrators = alive.filter((p) => p.role === 'infiltrator').length
  const others = alive.length - infiltrators

  if (infiltrators === 0) return 'desbravadores'
  if (infiltrators >= others) return 'infiltrators'
  return null
}

// ============================================
// UTILIDADES DE SESSÃO
// ============================================

/**
 * Gera código de 6 caracteres alfanuméricos para a sala.
 * Exclui caracteres ambíguos (0/O, 1/I/L).
 */
export function generateSessionCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
