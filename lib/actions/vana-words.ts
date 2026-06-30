'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import {
  generateCode,
  generateWordGrid,
  proposeTeams,
  selectArauto,
  type PlayerForTeam,
} from '@/utils/vana-words'
import type { TeamId } from '@/types/vana-words'

// ── Criar sessão (admin/host) ─────────────────────────────────
export async function createVanaWordsSession(isTest = false): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    throw new Error('Sem permissão')
  }

  const service = createServiceClient()
  let code = generateCode()
  // Garantir unicidade
  while (true) {
    const { data } = await service.from('vanawords_sessions').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = generateCode()
  }

  const { data: session, error } = await service
    .from('vanawords_sessions')
    .insert({ host_id: user.id, code, is_test_session: isTest })
    .select('id')
    .single()

  if (error || !session) throw new Error(error?.message ?? 'Erro ao criar sessão')
  return session.id
}

// ── Entrar na sessão (desbravadores) ─────────────────────────
export async function joinVanaWordsSession(
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
    .from('vanawords_sessions')
    .select('id, status')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!session) return { sessionId: '', error: 'Código inválido.' }
  if (session.status !== 'lobby') return { sessionId: '', error: 'A sessão já começou.' }

  const service = createServiceClient()

  // Verificar se já está na sessão
  const { data: existing } = await service
    .from('vanawords_players')
    .select('id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    await service.from('vanawords_players').insert({
      session_id: session.id,
      user_id: user.id,
      display_name: profile.full_name ?? user.email ?? 'Jogador',
      avatar_url: profile.avatar_url,
      section: profile.section,
    })
  }

  return { sessionId: session.id }
}

// ── Propor equipas ────────────────────────────────────────────
export async function proposeVanaWordsTeams(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'lobby') return { error: 'Estado inválido' }

  const service = createServiceClient()
  const { data: players } = await service
    .from('vanawords_players')
    .select('id, user_id, display_name, section')
    .eq('session_id', sessionId)

  if (!players || players.length < 4) return { error: 'Precisas de pelo menos 4 jogadores (2 por equipa: um Arauto e um que adivinha).' }

  const { teamA, teamB } = proposeTeams(players as PlayerForTeam[])

  // Actualizar equipas na BD
  await Promise.all([
    ...teamA.map((p) => service.from('vanawords_players').update({ team: 'a' }).eq('id', p.id)),
    ...teamB.map((p) => service.from('vanawords_players').update({ team: 'b' }).eq('id', p.id)),
  ])

  // Gerar as palavras da sessão — prioriza banco de palavras da BD
  const { data: wordBank } = await service
    .from('vanawords_word_bank')
    .select('word')
    .order('created_at')
  const wordPool = wordBank && wordBank.length >= 25
    ? wordBank.map((r) => r.word)
    : undefined // fallback para lista embutida
  const grid = generateWordGrid(wordPool)
  const wordRows = grid.map((w) => ({ session_id: sessionId, ...w }))
  await service.from('vanawords_words').delete().eq('session_id', sessionId)
  await service.from('vanawords_words').insert(wordRows)

  await service
    .from('vanawords_sessions')
    .update({ status: 'team_preview' })
    .eq('id', sessionId)

  return {}
}

// ── Mover jogador entre equipas (durante team_preview) ────────
export async function moveVanaWordsPlayer(
  sessionId: string,
  playerId: string,
  toTeam: TeamId,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id || session.status !== 'team_preview') return

  await service.from('vanawords_players').update({ team: toTeam, swap_requested: false }).eq('id', playerId)
}

// ── Pedir/cancelar troca de equipa (jogador, durante team_preview) ──
export async function requestVanaWordsSwap(
  sessionId: string,
  requested: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.status !== 'team_preview') return { error: 'Estado inválido' }

  const { data: player } = await service
    .from('vanawords_players')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!player) return { error: 'Não estás nesta sessão' }

  await service.from('vanawords_players').update({ swap_requested: requested }).eq('id', player.id)
  return {}
}

// ── Host responde a um pedido de troca (aceitar troca / recusar) ────
export async function respondVanaWordsSwap(
  sessionId: string,
  playerId: string,
  accept: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id || session.status !== 'team_preview') {
    return { error: 'Sem permissão' }
  }

  if (accept) {
    const { data: player } = await service
      .from('vanawords_players')
      .select('team')
      .eq('id', playerId)
      .maybeSingle()
    if (!player?.team) return { error: 'Jogador sem equipa' }
    const otherTeam: TeamId = player.team === 'a' ? 'b' : 'a'
    await service.from('vanawords_players').update({ team: otherTeam, swap_requested: false }).eq('id', playerId)
  } else {
    await service.from('vanawords_players').update({ swap_requested: false }).eq('id', playerId)
  }
  return {}
}

// ── Confirmar equipas e avançar para sorteio de Arautos ───────
export async function confirmVanaWordsTeams(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'team_preview') return { error: 'Estado inválido' }

  // Selecionar Arautos (um por equipa)
  const { data: players } = await service
    .from('vanawords_players')
    .select('id, user_id, display_name, section, team')
    .eq('session_id', sessionId)

  if (!players) return { error: 'Erro ao buscar jogadores' }

  const teamAPlayers = players.filter((p) => p.team === 'a')
  const teamBPlayers = players.filter((p) => p.team === 'b')

  if (!teamAPlayers.length || !teamBPlayers.length) return { error: 'Equipas vazias' }

  // Buscar histórico de Arautos recentes
  const allUserIds = players.map((p) => p.user_id).filter(Boolean)
  const { data: recentHistory } = await service
    .from('vanawords_players')
    .select('user_id, session_id, vanawords_sessions(created_at)')
    .in('user_id', allUserIds as string[])
    .eq('is_arauto', true)
    .order('joined_at', { ascending: false })
    .limit(100)

  const recentArautosMap: Record<string, string> = {}
  for (const h of recentHistory ?? []) {
    if (h.user_id && !recentArautosMap[h.user_id]) {
      const sess = h.vanawords_sessions as any
      recentArautosMap[h.user_id] = sess?.created_at ?? new Date().toISOString()
    }
  }
  const recentArautos = Object.entries(recentArautosMap).map(([user_id, last_at]) => ({ user_id, last_at }))

  const arautoA = selectArauto(teamAPlayers as PlayerForTeam[], recentArautos)
  const arautoB = selectArauto(teamBPlayers as PlayerForTeam[], recentArautos)

  // Marcar arautos na BD
  await service.from('vanawords_players').update({ is_arauto: false }).eq('session_id', sessionId)
  await service.from('vanawords_players').update({ is_arauto: true }).eq('id', arautoA.id)
  await service.from('vanawords_players').update({ is_arauto: true }).eq('id', arautoB.id)

  await service
    .from('vanawords_sessions')
    .update({ status: 'arauto_spin' })
    .eq('id', sessionId)

  return {}
}

// ── Trocar arauto manualmente (durante arauto_spin) ───────────
export async function rerollArauto(
  sessionId: string,
  team: TeamId,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'arauto_spin') return { error: 'Estado inválido' }

  const { data: players } = await service
    .from('vanawords_players')
    .select('id, user_id, display_name, section, team, is_arauto')
    .eq('session_id', sessionId)
    .eq('team', team)

  if (!players || players.length < 2) return { error: 'Não há jogadores suficientes para trocar.' }

  const currentArauto = players.find((p) => p.is_arauto)
  const candidates = players.filter((p) => !p.is_arauto)
  if (!candidates.length) return { error: 'Sem candidatos' }

  // Histórico
  const allUserIds = players.map((p) => p.user_id).filter(Boolean)
  const { data: recentHistory } = await service
    .from('vanawords_players')
    .select('user_id, vanawords_sessions(created_at)')
    .in('user_id', allUserIds as string[])
    .eq('is_arauto', true)
    .order('joined_at', { ascending: false })
    .limit(100)

  const recentArautosMap: Record<string, string> = {}
  for (const h of recentHistory ?? []) {
    if (h.user_id && !recentArautosMap[h.user_id]) {
      const sess = h.vanawords_sessions as any
      recentArautosMap[h.user_id] = sess?.created_at ?? new Date().toISOString()
    }
  }
  const recentArautos = Object.entries(recentArautosMap).map(([user_id, last_at]) => ({ user_id, last_at }))

  const newArauto = selectArauto(candidates as PlayerForTeam[], recentArautos)
  if (currentArauto) await service.from('vanawords_players').update({ is_arauto: false }).eq('id', currentArauto.id)
  await service.from('vanawords_players').update({ is_arauto: true }).eq('id', newArauto.id)

  return {}
}

// ── Confirmar Arautos e revelar grelhas ───────────────────────
export async function confirmVanaWordsArautos(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'arauto_spin') return { error: 'Estado inválido' }

  await service
    .from('vanawords_sessions')
    .update({ status: 'arauto_ready' })
    .eq('id', sessionId)

  return {}
}

// ── Arautos prontos → iniciar jogo ────────────────────────────
export async function startVanaWordsGame(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, board_version')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'arauto_ready') return { error: 'Estado inválido' }

  await service.from('vanawords_sessions').update({
    status: 'playing',
    current_team: 'a',
    current_phase: 'hinting',
    started_at: new Date().toISOString(),
    // Força o refetch das palavras nos clientes que montaram antes da grelha
    // ser gerada (lobby/arauto) — eles só recarregam quando board_version muda.
    board_version: (session.board_version ?? 0) + 1,
  }).eq('id', sessionId)

  return {}
}

// ── Arauto submete dica ───────────────────────────────────────
export async function submitHint(
  sessionId: string,
  hintWord: string,
  hintNumber: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, current_phase, current_team')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.status !== 'playing' || session.current_phase !== 'hinting') {
    return { error: 'Estado inválido para submeter dica.' }
  }

  // Verificar se é o Arauto da equipa certa
  const { data: me } = await service
    .from('vanawords_players')
    .select('id, is_arauto, team')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  const isHost = session.host_id === user.id
  if (!isHost && (!me || !me.is_arauto || me.team !== session.current_team)) {
    return { error: 'Não és o Arauto da equipa activa.' }
  }

  // ── Validação da dica (regras do Codenames) ─────────────────
  const clean = hintWord.trim()
  if (!clean) return { error: 'Escreve uma dica.' }
  // Tem de ser uma única palavra (sem espaços nem hífens)
  if (/[\s\-]/.test(clean)) {
    return { error: 'A dica tem de ser uma única palavra.' }
  }
  // Normaliza (sem acentos, minúsculas) para comparar com o quadro
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const normHint = normalize(clean)

  const { data: boardWords } = await service
    .from('vanawords_words')
    .select('word')
    .eq('session_id', sessionId)
  const onBoard = (boardWords ?? []).some((w) => normalize(w.word) === normHint)
  if (onBoard) {
    return { error: 'A dica não pode ser uma palavra que está no quadro.' }
  }

  // Limitar o número entre 1 e 5
  const safeNumber = Math.min(5, Math.max(1, Math.floor(hintNumber) || 1))

  await service.from('vanawords_sessions').update({
    current_hint: clean.toUpperCase(),
    current_hint_number: safeNumber,
    current_phase: 'guessing',
    // Regra do Codenames: a equipa tem direito a uma tentativa extra (N + 1)
    guesses_remaining: safeNumber + 1,
  }).eq('id', sessionId)

  // Limpar palpites anteriores
  await service.from('vanawords_guesses').delete().eq('session_id', sessionId)

  return {}
}

// ── Jogador coloca/remove palpite (suporta impersonação de bot) ──
export async function toggleGuess(
  sessionId: string,
  wordId: string,
  asBotId?: string, // host a impersonar um bot em sessão de teste
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, current_phase, current_team, is_test_session')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.status !== 'playing' || session.current_phase !== 'guessing') {
    return { error: 'Não é a fase de palpites.' }
  }

  let playerId: string

  if (asBotId) {
    // Modo impersonação: apenas host de sessão de teste
    if (session.host_id !== user.id || !session.is_test_session) {
      return { error: 'Sem permissão para impersonar bots.' }
    }
    const { data: bot } = await service
      .from('vanawords_players')
      .select('id, team, is_arauto')
      .eq('id', asBotId)
      .eq('session_id', sessionId)
      .eq('is_bot', true)
      .maybeSingle()
    if (!bot || bot.team !== session.current_team) return { error: 'Não é a vez deste bot.' }
    if (bot.is_arauto) return { error: 'O Arauto não pode votar.' }
    playerId = bot.id
  } else {
    // Modo normal: jogador real
    const { data: me } = await service
      .from('vanawords_players')
      .select('id, team, is_arauto')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!me || me.team !== session.current_team) return { error: 'Não é a tua vez.' }
    if (me.is_arauto) return { error: 'O Arauto não pode votar.' }
    playerId = me.id
  }

  const { data: existing } = await service
    .from('vanawords_guesses')
    .select('id')
    .eq('word_id', wordId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    await service.from('vanawords_guesses').delete().eq('id', existing.id)
  } else {
    await service.from('vanawords_guesses').insert({
      session_id: sessionId,
      word_id: wordId,
      player_id: playerId,
    })
  }

  return {}
}


// ── Host confirma palavra escolhida ──────────────────────────
export async function confirmWord(
  sessionId: string,
  wordId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, current_phase, current_team, current_hint, current_hint_number, guesses_remaining, board_version')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'playing' || session.current_phase !== 'guessing') {
    return { error: 'Estado inválido' }
  }

  const { data: word } = await service
    .from('vanawords_words')
    .select('id, word, team, is_revealed')
    .eq('id', wordId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (!word || word.is_revealed) return { error: 'Palavra inválida' }

  // Revelar a palavra
  await service.from('vanawords_words').update({
    is_revealed: true,
    revealed_at: new Date().toISOString(),
  }).eq('id', wordId)

  await service.from('vanawords_guesses').delete().eq('session_id', sessionId)

  const currentTeam = session.current_team as TeamId
  const otherTeam: TeamId = currentTeam === 'a' ? 'b' : 'a'

  let endReason: string | null = null
  let nextTeam = currentTeam
  let nextPhase = 'guessing'
  let nextGuesses = (session.guesses_remaining ?? 1) - 1
  let newStatus = 'playing'
  let winnerTeam: string | null = null
  let winReason: string | null = null

  if (word.team === 'black') {
    // Derrota imediata da equipa que adivinhou
    endReason = 'black'
    winnerTeam = otherTeam
    winReason = 'black_hit'
    newStatus = 'finished'
  } else if (word.team === otherTeam) {
    endReason = 'opponent'
    nextTeam = otherTeam
    nextPhase = 'hinting'
    nextGuesses = 0
  } else if (word.team === 'neutral') {
    endReason = 'neutral'
    nextTeam = otherTeam
    nextPhase = 'hinting'
    nextGuesses = 0
  } else {
    // Palavra correcta da equipa
    if (nextGuesses <= 0) {
      endReason = 'limit'
      nextTeam = otherTeam
      nextPhase = 'hinting'
      nextGuesses = 0
    }
  }

  // Verificar se alguma equipa ganhou por ter revelado todas as suas palavras
  if (newStatus !== 'finished') {
    const { data: allWords } = await service
      .from('vanawords_words')
      .select('team, is_revealed')
      .eq('session_id', sessionId)

    if (allWords) {
      const teamATotal = allWords.filter((w) => w.team === 'a').length
      const teamBTotal = allWords.filter((w) => w.team === 'b').length
      const teamARevealed = allWords.filter((w) => w.team === 'a' && w.is_revealed).length
      const teamBRevealed = allWords.filter((w) => w.team === 'b' && w.is_revealed).length

      if (teamARevealed >= teamATotal) {
        newStatus = 'finished'
        winnerTeam = 'a'
        winReason = 'all_found'
      } else if (teamBRevealed >= teamBTotal) {
        newStatus = 'finished'
        winnerTeam = 'b'
        winReason = 'all_found'
      }
    }
  }

  // Gravar histórico do turno (só quando o turno termina)
  if (endReason) {
    const { data: lastTurn } = await service
      .from('vanawords_turns')
      .select('turn_order, words_revealed, end_reason')
      .eq('session_id', sessionId)
      .order('turn_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastTurn && lastTurn.end_reason === null) {
      const wordsRevealed = [
        ...(lastTurn.words_revealed as any[] ?? []),
        { word: word.word, team: word.team },
      ]
      await service.from('vanawords_turns').update({
        words_revealed: wordsRevealed,
        end_reason: endReason,
      }).eq('session_id', sessionId).eq('turn_order', lastTurn.turn_order)
    }
  } else {
    // Adicionar à palavra revelada no turno actual
    const { data: lastTurn } = await service
      .from('vanawords_turns')
      .select('turn_order, words_revealed')
      .eq('session_id', sessionId)
      .order('turn_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastTurn) {
      const wordsRevealed = [
        ...(lastTurn.words_revealed as any[] ?? []),
        { word: word.word, team: word.team },
      ]
      await service.from('vanawords_turns').update({ words_revealed: wordsRevealed })
        .eq('session_id', sessionId).eq('turn_order', lastTurn.turn_order)
    }
  }

  // Novo turno se mudou de equipa
  if (endReason && newStatus === 'playing') {
    const { data: lastTurn } = await service
      .from('vanawords_turns')
      .select('turn_order')
      .eq('session_id', sessionId)
      .order('turn_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    await service.from('vanawords_turns').insert({
      session_id: sessionId,
      team: nextTeam,
      turn_order: (lastTurn?.turn_order ?? 0) + 1,
    })
  }

  // Ao entrar numa nova fase de "hinting" (turno mudou de equipa), a dica
  // anterior deixa de ser válida e tem de ser limpa.
  const enteringHinting = newStatus === 'playing' && nextPhase === 'hinting'

  await service.from('vanawords_sessions').update({
    status: newStatus,
    current_team: newStatus === 'finished' ? session.current_team : nextTeam,
    current_phase: newStatus === 'finished' ? session.current_phase : nextPhase,
    current_hint: enteringHinting ? null : session.current_hint,
    current_hint_number: enteringHinting ? null : session.current_hint_number,
    guesses_remaining: nextGuesses,
    winner_team: winnerTeam,
    win_reason: winReason,
    board_version: (session.board_version ?? 0) + 1,
    ended_at: newStatus === 'finished' ? new Date().toISOString() : null,
  }).eq('id', sessionId)

  return {}
}

// ── Host passa o turno ────────────────────────────────────────
export async function passTurn(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, current_phase, current_team')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'playing' || session.current_phase !== 'guessing') {
    return { error: 'Estado inválido' }
  }

  const currentTeam = session.current_team as TeamId
  const nextTeam: TeamId = currentTeam === 'a' ? 'b' : 'a'

  await service.from('vanawords_guesses').delete().eq('session_id', sessionId)

  // Fechar turno actual
  const { data: lastTurn } = await service
    .from('vanawords_turns')
    .select('turn_order')
    .eq('session_id', sessionId)
    .order('turn_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastTurn) {
    await service.from('vanawords_turns')
      .update({ end_reason: 'pass' })
      .eq('session_id', sessionId)
      .eq('turn_order', lastTurn.turn_order)
  }

  // Novo turno
  await service.from('vanawords_turns').insert({
    session_id: sessionId,
    team: nextTeam,
    turn_order: (lastTurn?.turn_order ?? 0) + 1,
  })

  await service.from('vanawords_sessions').update({
    current_team: nextTeam,
    current_phase: 'hinting',
    current_hint: null,
    current_hint_number: null,
    guesses_remaining: 0,
  }).eq('id', sessionId)

  return {}
}

// ── Atribuir XP e Gold ao grupo vencedor ─────────────────────
export async function awardVanaWordsPoints(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, winner_team, rewards_awarded')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status !== 'finished') return { error: 'O jogo ainda não terminou.' }
  if (session.rewards_awarded) return { error: 'Pontos já atribuídos.' }
  if (!session.winner_team) return { error: 'Sem vencedor definido.' }

  const { data: winners } = await service
    .from('vanawords_players')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('team', session.winner_team)
    .not('user_id', 'is', null)

  if (winners && winners.length > 0) {
    const logs = winners.map((p) => ({
      user_id: p.user_id!,
      xp: 100,
      gold: 50,
      source: 'vanawords' as const,
      description: 'Vitória no VanaWords',
    }))

    await service.from('points_log').insert(
      logs.map((l) => ({
        user_id: l.user_id,
        xp_change: l.xp,
        gold_change: l.gold,
        source: l.source,
        description: l.description,
      }))
    )

    // Actualizar totais no perfil
    for (const winner of winners) {
      const { data: prof } = await service
        .from('profiles')
        .select('total_xp, total_gold')
        .eq('id', winner.user_id!)
        .single()
      if (prof) {
        await service.from('profiles').update({
          total_xp: (prof.total_xp ?? 0) + 100,
          total_gold: (prof.total_gold ?? 0) + 50,
        }).eq('id', winner.user_id!)
      }
    }
  }

  await service
    .from('vanawords_sessions')
    .update({ rewards_awarded: true })
    .eq('id', sessionId)

  return {}
}

// ── Adicionar bot (sessões de teste) ─────────────────────────
export async function addVanaWordsBot(
  sessionId: string,
  displayName: string,
): Promise<{ botId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status, is_test_session')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (!session.is_test_session) return { error: 'Sessão não é de teste.' }
  if (session.status !== 'lobby') return { error: 'Só podes adicionar bots no lobby.' }

  const { data: bot, error } = await service
    .from('vanawords_players')
    .insert({
      session_id: sessionId,
      display_name: displayName,
      is_bot: true,
    })
    .select('id')
    .single()

  if (error || !bot) return { error: error?.message ?? 'Erro ao criar bot' }
  return { botId: bot.id }
}

// ── Buscar bot para impersonação ─────────────────────────────
export async function getVanaWordsBotForImpersonation(
  sessionId: string,
  playerId: string,
): Promise<{ bot?: { id: string; display_name: string; team: string | null; is_arauto: boolean }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data, error } = await supabase.rpc('get_vanawords_bot', {
    p_session_id: sessionId,
    p_player_id: playerId,
  })

  if (error || !data || data.length === 0) return { error: 'Bot não encontrado.' }
  return { bot: data[0] }
}

// ── Apagar sessão (antes de começar ou depois de acabar) ──────
export async function deleteVanaWordsSession(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const service = createServiceClient()
  const { data: session } = await service
    .from('vanawords_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.host_id !== user.id) return { error: 'Sem permissão' }
  if (session.status === 'playing') {
    return { error: 'Não podes apagar uma sessão a decorrer. Termina o jogo primeiro.' }
  }

  // Apagar dados dependentes primeiro (caso não haja ON DELETE CASCADE)
  await Promise.all([
    service.from('vanawords_guesses').delete().eq('session_id', sessionId),
    service.from('vanawords_words').delete().eq('session_id', sessionId),
    service.from('vanawords_turns').delete().eq('session_id', sessionId),
    service.from('vanawords_players').delete().eq('session_id', sessionId),
  ])
  const { error } = await service.from('vanawords_sessions').delete().eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}

// ── Banco de Palavras — CRUD ──────────────────────────────────

export async function addWordToBank(
  word: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    return { error: 'Sem permissão' }
  }

  const clean = word.trim()
  if (!clean) return { error: 'Palavra vazia.' }

  const service = createServiceClient()
  const { error } = await service
    .from('vanawords_word_bank')
    .insert({ word: clean, created_by: user.id })

  if (error) {
    if (error.code === '23505') return { error: `"${clean}" já existe no banco.` }
    return { error: error.message }
  }
  return {}
}

export async function addWordsToBank(
  words: string[], // lista de palavras (pode vir de textarea separado por vírgulas/newlines)
): Promise<{ added: number; skipped: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { added: 0, skipped: 0, error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    return { added: 0, skipped: 0, error: 'Sem permissão' }
  }

  const service = createServiceClient()
  const cleaned = [...new Set(words.map((w) => w.trim()).filter(Boolean))]
  if (!cleaned.length) return { added: 0, skipped: 0, error: 'Nenhuma palavra válida.' }

  const rows = cleaned.map((word) => ({ word, created_by: user.id }))
  // upsert com onConflict ignore
  const { data, error } = await service
    .from('vanawords_word_bank')
    .upsert(rows, { onConflict: 'word', ignoreDuplicates: true })
    .select('word')

  if (error) return { added: 0, skipped: 0, error: error.message }
  const added = data?.length ?? 0
  return { added, skipped: cleaned.length - added }
}

export async function deleteWordFromBank(
  wordId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    return { error: 'Sem permissão' }
  }

  const service = createServiceClient()
  await service.from('vanawords_word_bank').delete().eq('id', wordId)
  return {}
}
