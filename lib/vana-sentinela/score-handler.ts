// Gravar uma pontuação do VanaSentinela — lógica da rota
// POST /api/jogos/vana-sentinela/pontuacao, separada do Next/Supabase para poder
// ser testada com dependências falsas (score-handler.test.ts).
//
// Duas maneiras de entrar no ranking:
//   • membro com sessão → user_id da sessão (nunca do body) e, na primeira ronda
//     do dia em cada pack, XP e Gold;
//   • convidado sem conta → alcunha + id anónimo gerado no browser. Sem prémios.

import { z } from 'zod'
import { getPackDisponivel } from '@/utils/vana-sentinela/packs'
import { motivoPontuacaoImpossivel, normalizarAlcunha } from '@/utils/vana-sentinela/game'

/** Máx. 1 pontuação por jogador a cada 20 s. */
export const INTERVALO_MINIMO_MS = 20_000

const CLUB_ROLES = ['desbravador', 'dirigente', 'coordenador']

// Campos a mais (ex.: um user_id) são ignorados.
const BodySchema = z.object({
  pack: z.string().min(1).max(40),
  pontos: z.number().int().min(0),
  acertos: z.number().int().min(0),
  total: z.number().int().min(1),
  comboMax: z.number().int().min(0),
  duracaoMs: z.number().int().positive(),
  convidado: z
    .object({
      id: z.string().uuid(),
      nome: z.string().max(60),
    })
    .optional(),
})

export type ScoreRow = {
  pack: string
  user_id: string | null
  guest_id: string | null
  guest_name: string | null
  points: number
  correct: number
  total: number
  max_combo: number
  duration_ms: number
}

/** Quem está a gravar: um membro (sessão) ou um convidado (id anónimo). */
export type Jogador = { userId: string } | { guestId: string }

export type Recompensa = {
  awarded: boolean
  xp?: number
  gold?: number
  multiplier?: number
  message?: string | null
}

export interface ScoreDeps {
  /** id do utilizador com sessão iniciada, ou null. */
  getUserId(): Promise<string | null>
  /** Cargo efetivo do perfil (desbravador/dirigente/coordenador), ou null sem perfil. */
  getRole(userId: string): Promise<string | null>
  /** Pode jogar segundo Gestão → Jogos? (null = convidado sem conta) */
  canPlay(role: string | null): Promise<boolean>
  /** Data da última pontuação gravada deste jogador, ou null. */
  lastScoreAt(jogador: Jogador): Promise<Date | null>
  insert(row: ScoreRow): Promise<{ id: string | null; error: string | null }>
  /** XP/Gold da primeira ronda do dia (só membros; a BD decide se já recebeu). */
  award(scoreId: string): Promise<Recompensa | null>
  now?(): Date
}

export type ScoreResponse = { status: number; body: Record<string, unknown> }

export async function handleScorePost(rawBody: unknown, deps: ScoreDeps): Promise<ScoreResponse> {
  const userId = await deps.getUserId()
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>

  // 1. Quem é o jogador
  if (userId) {
    const role = await deps.getRole(userId)
    if (!role || !CLUB_ROLES.includes(role)) {
      return { status: 403, body: { error: 'Conta sem perfil do clube.' } }
    }
    if (!(await deps.canPlay(role))) {
      return { status: 403, body: { error: 'Este jogo não está disponível de momento.' } }
    }
  } else {
    // Sem sessão e sem identificação de convidado: não se grava nada.
    if (!body.convidado) return { status: 401, body: { error: 'Escolhe uma alcunha ou inicia sessão.' } }
    if (!(await deps.canPlay(null))) {
      return { status: 403, body: { error: 'Este jogo não está disponível de momento.' } }
    }
  }

  // 2. A ronda
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'Pedido inválido.' } }
  const p = parsed.data

  const guestName = userId ? null : normalizarAlcunha(p.convidado?.nome)
  if (!userId && !guestName) return { status: 400, body: { error: 'Alcunha inválida.' } }
  const jogador: Jogador = userId ? { userId } : { guestId: p.convidado!.id }

  if (!getPackDisponivel(p.pack)) return { status: 400, body: { error: 'Pack inexistente ou indisponível.' } }

  const motivo = motivoPontuacaoImpossivel(p)
  if (motivo) return { status: 400, body: { error: motivo } }

  // 3. Rate limit
  const last = await deps.lastScoreAt(jogador)
  const now = deps.now?.() ?? new Date()
  if (last && now.getTime() - last.getTime() < INTERVALO_MINIMO_MS) {
    return { status: 429, body: { error: 'Espera um pouco antes de gravar outra pontuação.' } }
  }

  // 4. Gravar
  const { id, error } = await deps.insert({
    pack: p.pack,
    user_id: 'userId' in jogador ? jogador.userId : null,
    guest_id: 'guestId' in jogador ? jogador.guestId : null,
    guest_name: guestName,
    points: p.pontos,
    correct: p.acertos,
    total: p.total,
    max_combo: p.comboMax,
    duration_ms: p.duracaoMs,
  })
  if (error || !id) return { status: 500, body: { error: 'Não foi possível gravar a pontuação.' } }

  // 5. Prémio dos membros (se falhar, a pontuação fica gravada na mesma)
  const recompensa = userId ? await deps.award(id).catch(() => null) : null

  return { status: 201, body: { ok: true, recompensa } }
}
