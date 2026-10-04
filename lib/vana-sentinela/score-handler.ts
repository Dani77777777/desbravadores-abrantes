// Gravar uma pontuação do VanaSentinela — lógica da rota
// POST /api/jogos/vana-sentinela/pontuacao, separada do Next/Supabase para poder
// ser testada com dependências falsas (score-handler.test.ts).

import { z } from 'zod'
import { getPackDisponivel } from '@/utils/vana-sentinela/packs'
import { motivoPontuacaoImpossivel } from '@/utils/vana-sentinela/game'

/** Máx. 1 pontuação por jogador a cada 20 s. */
export const INTERVALO_MINIMO_MS = 20_000

const CLUB_ROLES = ['desbravador', 'dirigente', 'coordenador']

// O user_id NUNCA vem do body: vem sempre da sessão (campos a mais são ignorados).
const BodySchema = z.object({
  pack: z.string().min(1).max(40),
  pontos: z.number().int().min(0),
  acertos: z.number().int().min(0),
  total: z.number().int().min(1),
  comboMax: z.number().int().min(0),
  duracaoMs: z.number().int().positive(),
})

export type ScoreRow = {
  pack: string
  user_id: string
  points: number
  correct: number
  total: number
  max_combo: number
  duration_ms: number
}

export interface ScoreDeps {
  /** id do utilizador com sessão iniciada, ou null. */
  getUserId(): Promise<string | null>
  /** Cargo efetivo do perfil (desbravador/dirigente/coordenador), ou null sem perfil. */
  getRole(userId: string): Promise<string | null>
  /** Pode jogar segundo Gestão → Jogos? */
  canPlay(role: string): Promise<boolean>
  /** Data da última pontuação gravada deste jogador, ou null. */
  lastScoreAt(userId: string): Promise<Date | null>
  insert(row: ScoreRow): Promise<{ error: string | null }>
  now?(): Date
}

export type ScoreResponse = { status: number; body: Record<string, unknown> }

export async function handleScorePost(rawBody: unknown, deps: ScoreDeps): Promise<ScoreResponse> {
  // 1. Sessão primeiro: sem sessão não se olha para mais nada.
  const userId = await deps.getUserId()
  if (!userId) return { status: 401, body: { error: 'Inicia sessão para gravar a pontuação.' } }

  const role = await deps.getRole(userId)
  if (!role || !CLUB_ROLES.includes(role)) {
    return { status: 403, body: { error: 'O ranking é só para membros do clube.' } }
  }
  if (!(await deps.canPlay(role))) {
    return { status: 403, body: { error: 'Este jogo não está disponível de momento.' } }
  }

  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'Pedido inválido.' } }
  const p = parsed.data

  if (!getPackDisponivel(p.pack)) return { status: 400, body: { error: 'Pack inexistente ou indisponível.' } }

  const motivo = motivoPontuacaoImpossivel(p)
  if (motivo) return { status: 400, body: { error: motivo } }

  const last = await deps.lastScoreAt(userId)
  const now = deps.now?.() ?? new Date()
  if (last && now.getTime() - last.getTime() < INTERVALO_MINIMO_MS) {
    return { status: 429, body: { error: 'Espera um pouco antes de gravar outra pontuação.' } }
  }

  const { error } = await deps.insert({
    pack: p.pack,
    user_id: userId,
    points: p.pontos,
    correct: p.acertos,
    total: p.total,
    max_combo: p.comboMax,
    duration_ms: p.duracaoMs,
  })
  if (error) return { status: 500, body: { error: 'Não foi possível gravar a pontuação.' } }

  return { status: 201, body: { ok: true } }
}
