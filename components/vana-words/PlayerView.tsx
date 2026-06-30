'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toggleGuess } from '@/lib/actions/vana-words'
import { WordGrid } from './WordGrid'
import { TEAM_LABELS, TEAM_COLORS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'
import { Crown, Bot } from 'lucide-react'

interface PlayerViewProps {
  session: VanaWordsSession
  myPlayer: VanaWordsPlayer
  initialPlayers: VanaWordsPlayer[]
  /** Se definido, o host está a impersonar este bot (usa o id do bot nas acções) */
  asBotId?: string
}

export function PlayerView({ session: initSession, myPlayer, initialPlayers, asBotId }: PlayerViewProps) {
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState<VanaWordsWord[]>([])
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchWords = useCallback(async () => {
    const { data } = await supabase.rpc('get_vanawords_public', { p_session_id: session.id })
    if (data) setWords(data as VanaWordsWord[])
  }, [session.id])

  const fetchGuesses = useCallback(async () => {
    const { data } = await supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
    if (data) setGuesses(data as VanaWordsGuess[])
  }, [session.id])

  const fetchSession = useCallback(async () => {
    const { data } = await supabase.from('vanawords_sessions').select('*').eq('id', session.id).maybeSingle()
    if (data) setSession((s) => ({ ...s, ...(data as VanaWordsSession) }))
  }, [session.id])

  useEffect(() => {
    fetchWords()
    fetchGuesses()

    const chan = supabase.channel(`vanawords-player-${session.id}-${myPlayer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_sessions', filter: `id=eq.${session.id}` },
        (payload) => { setSession((s) => ({ ...s, ...(payload.new as VanaWordsSession) })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_players', filter: `session_id=eq.${session.id}` },
        () => {
          supabase.from('vanawords_players').select('*').eq('session_id', session.id)
            .then(({ data }) => { if (data) setPlayers(data as VanaWordsPlayer[]) })
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_guesses', filter: `session_id=eq.${session.id}` },
        () => { fetchGuesses() })
      .subscribe()

    // Reforço: sondagem periódica caso o realtime falhe (ex.: dica do Arauto que
    // muda current_phase de 'hinting' para 'guessing' não chegava ao jogador).
    const poll = setInterval(() => {
      fetchSession()
      fetchGuesses()
    }, 2500)

    return () => { supabase.removeChannel(chan); clearInterval(poll) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version, session.status])

  // O id efectivo para identificar palpites: bot impersonado ou jogador real
  const effectivePlayerId = asBotId ?? myPlayer.id
  // Usa o estado em tempo real (players) para refletir mudanças de equipa feitas pelo host
  const myPlayerLive = players.find((p) => p.id === myPlayer.id) ?? myPlayer
  const myTeam = myPlayerLive.team as TeamId | null
  const colors = myTeam ? TEAM_COLORS[myTeam] : null
  const teamLabel = myTeam ? TEAM_LABELS[myTeam] : null
  const isBotMode = !!asBotId

  async function handleWordClick(wordId: string) {
    setLoading(true)
    setError(null)
    // Passa asBotId quando em modo de impersonação
    const res = await toggleGuess(session.id, wordId, asBotId)
    if (res?.error) setError(res.error)
    // Atualiza logo a grelha sem depender só do realtime (que pode falhar p/ DELETE)
    await fetchGuesses()
    setLoading(false)
  }

  // ── Lobby ────────────────────────────────────────────────────
  if (session.status === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="flex flex-col items-center text-center gap-2">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-20 w-auto object-contain drop-shadow-2xl" />
          <p className="text-slate-400">Olá, {myPlayer.display_name}!</p>
        </div>
        <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700 text-center">
          <p className="text-slate-400 text-sm">A aguardar que o host inicie o jogo…</p>
          <div className="flex justify-center mt-4 gap-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
        <p className="text-slate-600 text-xs">{players.length} jogador(es) no lobby</p>
      </div>
    )
  }

  // ── Team Preview ───────────────────────────────────────────
  if (session.status === 'team_preview') {
    const teamMates = players.filter((p) => p.team === myTeam)
    const otherTeam = myTeam === 'a' ? 'b' : 'a'
    const opponents = players.filter((p) => p.team === otherTeam)
    const opponentColors = TEAM_COLORS[otherTeam]
    const opponentLabel = TEAM_LABELS[otherTeam]

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="flex flex-col items-center text-center gap-2">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-16 w-auto object-contain drop-shadow-2xl" />
          {myTeam && colors && (
            <p className={`${colors.text} font-bold text-lg mt-1`}>
              {myTeam === 'a' ? '🦁' : '🦅'} Estás na Equipa {teamLabel}!
            </p>
          )}
        </div>

        {myTeam && colors && (
          <div className={`w-full max-w-xs rounded-2xl p-4 border ${colors.badge}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${colors.text}`}>
              A tua equipa
            </p>
            <div className="flex flex-wrap gap-2">
              {teamMates.map((p) => (
                <span
                  key={p.id}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                    p.id === myPlayer.id ? 'bg-white text-slate-900' : `${colors.bg}/20 text-white`
                  }`}
                >
                  {p.display_name}{p.id === myPlayer.id ? ' (tu)' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={`w-full max-w-xs rounded-2xl p-4 border ${opponentColors.badge} opacity-70`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${opponentColors.text}`}>
            Equipa {opponentLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {opponents.map((p) => (
              <span key={p.id} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 text-white/80">
                {p.display_name}
              </span>
            ))}
          </div>
        </div>

        <p className="text-slate-500 text-sm">A aguardar que o host confirme as equipas…</p>
      </div>
    )
  }

  // ── Arauto Spin ────────────────────────────────────────────
  if (session.status === 'arauto_spin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="text-6xl" style={{ animation: 'spin 1s linear infinite' }}>🎰</div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-white">A Escolher os Arautos…</h2>
          <p className="text-slate-400 text-sm mt-1">A roleta está a decidir quem guiará cada equipa</p>
        </div>
      </div>
    )
  }

  // ── Arauto Ready ───────────────────────────────────────────
  if (session.status === 'arauto_ready') {
    const arautoA = players.find((p) => p.team === 'a' && p.is_arauto)
    const arautoB = players.find((p) => p.team === 'b' && p.is_arauto)
    const amArauto = myPlayer.is_arauto

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="text-center">
          <h2 className="text-2xl font-black text-white">Os Arautos foram escolhidos!</h2>
          {myTeam && colors && (
            <p className={`${colors.text} text-sm mt-1 font-semibold`}>
              Equipa {myTeam === 'a' ? '🦁' : '🦅'} {teamLabel}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-amber-500/40 text-center min-w-[130px]">
            <p className="text-amber-400 text-xs font-bold mb-2">🦁 Arauto Leão</p>
            <p className="text-white font-bold text-sm">{arautoA?.display_name ?? '—'}</p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-blue-500/40 text-center min-w-[130px]">
            <p className="text-blue-400 text-xs font-bold mb-2">🦅 Arauto Águia</p>
            <p className="text-white font-bold text-sm">{arautoB?.display_name ?? '—'}</p>
          </div>
        </div>
        {amArauto && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-2xl p-4 text-center">
            <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
            <p className="text-yellow-300 font-bold">Tu és o Arauto!</p>
            <p className="text-yellow-400/70 text-xs mt-1">Abre a Vista de Arauto no teu dispositivo.</p>
            <a
              href={`/jogos/vana-words/${session.id}/arauto`}
              className="mt-3 inline-block px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-900/30 active:scale-95 transition-transform"
            >
              Abrir Vista de Arauto
            </a>
          </div>
        )}
        <p className="text-slate-500 text-sm">A aguardar que o host inicie…</p>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────
  if (session.status === 'playing') {
    const activeTeam = session.current_team as TeamId
    const isMyTurn = myTeam === activeTeam
    const amArauto = myPlayer.is_arauto
    const isHinting = session.current_phase === 'hinting'
    const activeColors = TEAM_COLORS[activeTeam]
    const activeLabel = TEAM_LABELS[activeTeam]
    const activeIcon = activeTeam === 'a' ? '🦁' : '🦅'

    const canVote = isMyTurn && !amArauto && !isHinting

    const wordsARevealed = words.filter((w) => w.team === 'a' && w.is_revealed).length
    const wordsBRevealed = words.filter((w) => w.team === 'b' && w.is_revealed).length

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-3">
        <div className="max-w-lg mx-auto space-y-4">
          {isBotMode && <BotBanner name={myPlayer.display_name} />}

          {/* Badge da equipa */}
          {myTeam && colors && (
            <div className={`flex items-center justify-between px-4 py-2 rounded-xl border ${colors.badge}`}>
              <span className={`font-bold text-sm ${colors.text}`}>
                {myTeam === 'a' ? '🦁' : '🦅'} Equipa {teamLabel}
              </span>
              {amArauto && (
                <span className="text-yellow-300 text-xs font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Arauto
                </span>
              )}
            </div>
          )}

          {/* Marcador */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className={`bg-slate-800/60 rounded-xl p-2 border ${activeTeam === 'a' ? 'border-amber-500' : 'border-slate-700'}`}>
              <p className="text-amber-400 text-xs">🦁 Leão</p>
              <p className="text-white font-bold">{wordsARevealed}/5</p>
            </div>
            <div className={`bg-slate-800/60 rounded-xl p-2 border ${activeTeam === 'b' ? 'border-blue-500' : 'border-slate-700'}`}>
              <p className="text-blue-400 text-xs">🦅 Águia</p>
              <p className="text-white font-bold">{wordsBRevealed}/5</p>
            </div>
          </div>

          {/* Estado do turno */}
          <div className={`rounded-xl p-3 border ${activeColors.badge} ${canVote ? 'ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-900/30' : ''}`}>
            <p className={`font-bold text-sm ${activeColors.text}`}>{activeIcon} Vez da Equipa {activeLabel}</p>
            {isHinting ? (
              <p className="text-slate-400 text-sm mt-0.5">A aguardar dica do Arauto…</p>
            ) : (
              <>
                <p className="text-white text-lg font-black mt-1">
                  «{session.current_hint}» — {session.current_hint_number}
                </p>
                <p className={`text-xs mt-0.5 ${activeColors.text}`}>
                  {session.guesses_remaining} tentativa(s) restante(s)
                </p>
              </>
            )}
          </div>

          {/* Grelha */}
          <WordGrid
            words={words}
            guesses={guesses}
            players={players}
            myPlayerId={effectivePlayerId}
            showColors={false}
            onWordClick={canVote ? handleWordClick : undefined}
            disabled={!canVote || loading}
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {isMyTurn && amArauto && isHinting && (
            <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-3 text-center">
              <p className="text-yellow-300 font-bold text-sm">É a tua vez de dar a dica!</p>
              <a
                href={`/jogos/vana-words/${session.id}/arauto`}
                className="mt-2 inline-block px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-900/30 active:scale-95 transition-transform"
              >
                Abrir Vista de Arauto
              </a>
            </div>
          )}
          {!isMyTurn && (
            <p className="text-slate-500 text-sm text-center">A aguardar a tua vez…</p>
          )}
          {canVote && (
            <p className="text-emerald-400 text-xs text-center animate-pulse">
              Clica numa palavra para votar · clica de novo para cancelar
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Finished ───────────────────────────────────────────────
  if (session.status === 'finished') {
    const winner = session.winner_team as TeamId | null
    const iWon = winner && myTeam === winner
    const label = winner ? TEAM_LABELS[winner] : null
    const icon = winner === 'a' ? '🦁' : winner === 'b' ? '🦅' : '🏆'

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6 text-center">
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <p className="text-7xl">{iWon ? '🏆' : icon}</p>
        <h1 className="text-3xl font-black text-white">
          {winner ? `Equipa ${label} venceu!` : 'Jogo terminado!'}
        </h1>
        {iWon ? (
          <p className="text-emerald-400 text-lg font-semibold">Parabéns! A tua equipa ganhou 100 XP e 50 Gold!</p>
        ) : (
          <p className="text-slate-400">Boa sorte na próxima vez!</p>
        )}
        {session.win_reason === 'black_hit' && (
          <p className="text-red-400 text-sm">A palavra preta foi revelada! 💀</p>
        )}
        <p className="text-slate-500 text-sm -mb-2">Todas as palavras:</p>
        <WordGrid words={words} guesses={[]} players={players} showColors disabled />
      </div>
    )
  }

  return null
}

function BotBanner({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-900/50 border border-purple-700/50 text-xs text-purple-300 font-semibold w-fit mx-auto">
      <Bot className="w-3.5 h-3.5" />
      A controlar: {name}
    </div>
  )
}
