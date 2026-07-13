'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { generateCode } from '@/utils/vana-words'
import {
  FALLBACK_WORDS,
  maskWord,
  guesserPoints,
  DRAWER_POINTS_PER_GUESS,
} from '@/utils/vana-sketch'
import { normalizeText } from '@/utils/text-normalization'
import { effectiveRole } from '@/utils/permissions'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Criar sessão (admin/host) ─────────────────────────────────
export async function createVanaSketchSession(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, helper_role').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (role !== 'coordenador' && role !== 'dirigente') {
    throw new Error('Sem permissão')
  }

  const service = createServiceClient()
  let code = generateCode()
  while (true) {
    const { data } = await service.from('vanasketch_sessions').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = generateCode()
  }

  const { data: session, error } = await service
    .from('vanasketch_sessions')
    .insert({ host_id: user.id, code })
    .select('id')
    .single()

  if (error || !session) throw new Error(error?.message ?? 'Erro ao criar sessão')
  return session.id
}

// ── Entrar na sessão ──────────────────────────────────────────
export async function joinVanaSketchSession(
  code: string,
): Promise<{ sessionId: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sessionId: '', error: 'Precisas de fazer login para jogar.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, section, role')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.role) {
    return { sessionId: '', error: 'Apenas membros do clube podem jogar.' }
  }

  const { data: session } = await supabase
    .from('vanasketch_sessions')
    .select('id, status')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!session) return { sessionId: '', error: 'Código inválido.' }
  if (session.status === 'finished') return { sessionId: '', error: 'Essa sessão já terminou.' }

  const service = createServiceClient()

  // Reconectar se já estiver na sessão
  const { data: existing } = await service
    .from('vanasketch_players')
    .select('id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return { sessionId: session.id }

  // A meio do jogo ainda se pode entrar — só para palpitar (draw_order null)
  await service.from('vanasketch_players').insert({
    session_id: session.id,
    user_id: user.id,
    display_name: profile.full_name ?? user.email ?? 'Jogador',
    avatar_url: profile.avatar_url,
    section: profile.section,
  })

  return { sessionId: session.id }
}

// ── Escolher 3 opções de palavra do dicionário Vantur ─────────
async function pickWordOptions(
  service: SupabaseClient,
  sessionId: string,
): Promise<string[]> {
  // Palavras já usadas nesta sessão (não repetir)
  const { data: usedRows } = await service
    .from('vanasketch_rounds')
    .select('word, word_options')
    .eq('session_id', sessionId)
  const used = new Set<string>()
  for (const r of usedRows ?? []) {
    if (r.word) used.add(normalizeText(r.word))
    for (const w of (r.word_options as string[]) ?? []) used.add(normalizeText(w))
  }

  const { data: dict } = await service.from('vantur_dictionary').select('word')
  let pool = (dict ?? []).map((r) => r.word as string).filter((w) => !used.has(normalizeText(w)))
  if (pool.length < 3) {
    pool = [...pool, ...FALLBACK_WORDS.filter((w) => !used.has(normalizeText(w)))]
  }
  if (pool.length < 3) pool = [...FALLBACK_WORDS] // último recurso: aceitar repetições

  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 3)
}

// ── Arrancar uma ronda (interno) ──────────────────────────────
async function startRound(
  service: SupabaseClient,
  sessionId: string,
  roundNumber: number,
): Promise<{ error?: string }> {
  const { data: players } = await service
    .from('vanasketch_players')
    .select('id, draw_order')
    .eq('session_id', sessionId)
    .not('draw_order', 'is', null)
    .order('draw_order')

  if (!players || players.length === 0) return { error: 'Sem jogadores na rotação.' }

  const drawer = players[(roundNumber - 1) % players.length]
  const options = await pickWordOptions(service, sessionId)

  const { error: roundError } = await service.from('vanasketch_rounds').insert({
    session_id: sessionId,
    round_number: roundNumber,
    drawer_player_id: drawer.id,
    word_options: options,
  })
  if (roundError) return { error: roundError.message }

  // Limpar traços de rondas anteriores (o quadro começa em branco)
  await service.from('vanasketch_strokes').delete().eq('session_id', sessionId)

  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('canvas_version')
    .eq('id', sessionId)
    .single()

  await service.from('vanasketch_sessions').update({
    round_number: roundNumber,
    drawer_player_id: drawer.id,
    phase: 'choosing',
    word_masked: null,
    revealed_word: null,
    round_ends_at: null,
    canvas_version: (session?.canvas_version ?? 0) + 1,
  }).eq('id', sessionId)

  return {}
}

// ── Começar o jogo ────────────────────────────────────────────
export async function startVanaSketchGame(
  sessionId: string,
  opts: { roundsPerPlayer: number; drawSeconds: number },
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'lobby') return { error: 'Estado inválido' }

  const { data: players } = await service
    .from('vanasketch_players')
    .select('id')
    .eq('session_id', sessionId)

  if (!players || players.length < 2) {
    return { error: 'Precisas de pelo menos 2 jogadores (um desenha, outro adivinha).' }
  }

  const roundsPerPlayer = Math.min(3, Math.max(1, Math.floor(opts.roundsPerPlayer) || 1))
  const drawSeconds = Math.min(300, Math.max(30, Math.floor(opts.drawSeconds) || 90))

  // Baralhar a ordem de desenho
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  await Promise.all(
    shuffled.map((p, i) =>
      service.from('vanasketch_players').update({ draw_order: i }).eq('id', p.id)
    )
  )

  await service.from('vanasketch_sessions').update({
    status: 'playing',
    total_rounds: players.length * roundsPerPlayer,
    rounds_per_player: roundsPerPlayer,
    draw_seconds: drawSeconds,
    started_at: new Date().toISOString(),
  }).eq('id', sessionId)

  return startRound(service, sessionId, 1)
}

// ── Desenhador escolhe a palavra ──────────────────────────────
// optionIndex -1 = aleatória (host pode forçar se o desenhador demorar)
export async function chooseSketchWord(
  sessionId: string,
  optionIndex: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status, phase, round_number, drawer_player_id, draw_seconds')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.status !== 'playing' || session.phase !== 'choosing') {
    return { error: 'Estado inválido.' }
  }

  const isHost = session.host_id === user.id
  if (!isHost) {
    const { data: me } = await service
      .from('vanasketch_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!me || me.id !== session.drawer_player_id) {
      return { error: 'Não és o desenhador desta ronda.' }
    }
  }

  const { data: round } = await service
    .from('vanasketch_rounds')
    .select('id, word_options')
    .eq('session_id', sessionId)
    .eq('round_number', session.round_number)
    .maybeSingle()
  if (!round) return { error: 'Ronda não encontrada.' }

  const options = (round.word_options as string[]) ?? []
  if (!options.length) return { error: 'Sem opções de palavra.' }

  const idx = optionIndex >= 0 && optionIndex < options.length
    ? optionIndex
    : Math.floor(Math.random() * options.length)
  const word = options[idx]

  await service.from('vanasketch_rounds').update({
    word,
    started_at: new Date().toISOString(),
  }).eq('id', round.id)

  await service.from('vanasketch_sessions').update({
    phase: 'drawing',
    word_masked: maskWord(word),
    round_ends_at: new Date(Date.now() + session.draw_seconds * 1000).toISOString(),
  }).eq('id', sessionId)

  return {}
}

// ── Palpite ───────────────────────────────────────────────────
export async function submitSketchGuess(
  sessionId: string,
  guessText: string,
): Promise<{ correct?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const clean = guessText.trim().slice(0, 60)
  if (!clean) return { error: 'Escreve um palpite.' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('status, phase, round_number, drawer_player_id, round_ends_at, draw_seconds')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.status !== 'playing' || session.phase !== 'drawing') {
    return { error: 'Não é altura de palpitar.' }
  }

  const { data: me } = await service
    .from('vanasketch_players')
    .select('id, score')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Não estás nesta sessão.' }
  if (me.id === session.drawer_player_id) return { error: 'O desenhador não palpita 😉' }

  // Já acertou nesta ronda?
  const { data: alreadyCorrect } = await service
    .from('vanasketch_guesses')
    .select('id')
    .eq('session_id', sessionId)
    .eq('round_number', session.round_number)
    .eq('player_id', me.id)
    .eq('is_correct', true)
    .maybeSingle()
  if (alreadyCorrect) return { error: 'Já acertaste nesta ronda!' }

  const { data: round } = await service
    .from('vanasketch_rounds')
    .select('id, word, drawer_player_id')
    .eq('session_id', sessionId)
    .eq('round_number', session.round_number)
    .maybeSingle()
  if (!round?.word) return { error: 'Ronda inválida.' }

  const isCorrect = normalizeText(clean) === normalizeText(round.word)

  let points = 0
  if (isCorrect) {
    const msLeft = session.round_ends_at
      ? Math.max(0, new Date(session.round_ends_at).getTime() - Date.now())
      : 0
    points = guesserPoints(msLeft, session.draw_seconds)
  }

  await service.from('vanasketch_guesses').insert({
    session_id: sessionId,
    round_number: session.round_number,
    player_id: me.id,
    // Palpites certos não mostram o texto (não revelar a palavra no feed)
    guess_text: isCorrect ? null : clean,
    is_correct: isCorrect,
    points,
  })

  if (isCorrect) {
    await service.from('vanasketch_players')
      .update({ score: me.score + points })
      .eq('id', me.id)

    // Bónus do desenhador por cada acerto
    const { data: drawer } = await service
      .from('vanasketch_players')
      .select('id, score')
      .eq('id', round.drawer_player_id)
      .maybeSingle()
    if (drawer) {
      await service.from('vanasketch_players')
        .update({ score: drawer.score + DRAWER_POINTS_PER_GUESS })
        .eq('id', drawer.id)
    }

    // Toda a gente acertou? → terminar a ronda
    const [{ data: allPlayers }, { data: correctGuesses }] = await Promise.all([
      service.from('vanasketch_players').select('id').eq('session_id', sessionId),
      service.from('vanasketch_guesses')
        .select('player_id')
        .eq('session_id', sessionId)
        .eq('round_number', session.round_number)
        .eq('is_correct', true),
    ])
    const guessers = (allPlayers ?? []).filter((p) => p.id !== session.drawer_player_id)
    const correctIds = new Set((correctGuesses ?? []).map((g) => g.player_id))
    if (guessers.length > 0 && guessers.every((p) => correctIds.has(p.id))) {
      await finishRound(service, sessionId, session.round_number, 'all_guessed')
    }
  }

  return { correct: isCorrect }
}

// ── Terminar ronda (interno) ──────────────────────────────────
async function finishRound(
  service: SupabaseClient,
  sessionId: string,
  roundNumber: number,
  reason: 'all_guessed' | 'timeout' | 'skipped',
): Promise<void> {
  const { data: round } = await service
    .from('vanasketch_rounds')
    .select('id, word, ended_at')
    .eq('session_id', sessionId)
    .eq('round_number', roundNumber)
    .maybeSingle()
  if (!round || round.ended_at) return

  await service.from('vanasketch_rounds').update({
    ended_at: new Date().toISOString(),
    end_reason: reason,
  }).eq('id', round.id)

  await service.from('vanasketch_sessions').update({
    phase: 'round_end',
    revealed_word: round.word,
    round_ends_at: null,
  }).eq('id', sessionId)
}

// ── Host termina a ronda (timeout do relógio ou skip manual) ──
export async function endSketchRound(
  sessionId: string,
  reason: 'timeout' | 'skipped',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status, phase, round_number, round_ends_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'playing') return { error: 'Estado inválido' }
  if (session.phase !== 'drawing' && session.phase !== 'choosing') {
    return { error: 'A ronda já terminou.' }
  }

  // Timeout só depois de o relógio passar mesmo (3s de tolerância)
  if (reason === 'timeout') {
    if (!session.round_ends_at) return { error: 'Sem relógio activo.' }
    if (Date.now() < new Date(session.round_ends_at).getTime() - 3000) {
      return { error: 'Ainda há tempo.' }
    }
  }

  await finishRound(service, sessionId, session.round_number, reason)
  return {}
}

// ── Próxima ronda / fim do jogo ───────────────────────────────
export async function nextSketchRound(
  sessionId: string,
): Promise<{ finished?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status, phase, round_number, total_rounds')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'playing' || session.phase !== 'round_end') {
    return { error: 'Estado inválido' }
  }

  if (session.round_number >= session.total_rounds) {
    await service.from('vanasketch_sessions').update({
      status: 'finished',
      phase: null,
      drawer_player_id: null,
      word_masked: null,
      round_ends_at: null,
      ended_at: new Date().toISOString(),
    }).eq('id', sessionId)
    return { finished: true }
  }

  const res = await startRound(service, sessionId, session.round_number + 1)
  if (res.error) return { error: res.error }
  return {}
}

// ── Atribuir XP e Gold (pódio + participação) ─────────────────
export async function awardVanaSketchPoints(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status, rewards_awarded')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'finished') return { error: 'O jogo ainda não terminou.' }
  if (session.rewards_awarded) return { error: 'Pontos já atribuídos.' }

  const { data: players } = await service
    .from('vanasketch_players')
    .select('user_id, score')
    .eq('session_id', sessionId)
    .order('score', { ascending: false })

  if (players && players.length > 0) {
    const rewards = players.map((p, i) => {
      const [xp, gold] =
        i === 0 ? [100, 50] :
        i === 1 ? [60, 30] :
        i === 2 ? [40, 20] :
        [20, 10]
      return {
        target_user_id: p.user_id,
        awarded_by_user_id: user.id,
        amount_xp: xp,
        amount_gold: gold,
        description: i === 0 ? 'Vencedor do VanaSketch 🎨' : 'Participação no VanaSketch',
      }
    })
    const { error: logError } = await service.from('points_log').insert(rewards)
    if (logError) return { error: logError.message }
  }

  await service
    .from('vanasketch_sessions')
    .update({ rewards_awarded: true })
    .eq('id', sessionId)

  return {}
}

// ── Apagar sessão ─────────────────────────────────────────────
export async function deleteVanaSketchSession(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanasketch_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status === 'playing') {
    return { error: 'Não podes apagar uma sessão a decorrer. Termina o jogo primeiro.' }
  }

  await Promise.all([
    service.from('vanasketch_guesses').delete().eq('session_id', sessionId),
    service.from('vanasketch_strokes').delete().eq('session_id', sessionId),
    service.from('vanasketch_rounds').delete().eq('session_id', sessionId),
  ])
  // A FK drawer_player_id → players exige apagar a referência antes dos jogadores
  await service.from('vanasketch_sessions').update({ drawer_player_id: null }).eq('id', sessionId)
  await service.from('vanasketch_players').delete().eq('session_id', sessionId)
  const { error } = await service.from('vanasketch_sessions').delete().eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}
