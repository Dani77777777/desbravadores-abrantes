'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { toggleGuess, requestVanaWordsSwap, respondArautoChoice } from '@/lib/actions/vana-words'
import { WordGrid } from './WordGrid'
import { TeamChip, BlipDots } from './ui'
import { VW, VW_SCREEN_STYLE, VW_PANEL_STYLE, VW_SOFT_PULSE, teamPanelStyle, vwSans, vwSerif } from './theme'
import { TEAM_LABELS } from '@/types/vana-words'
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
  const router = useRouter()
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState<VanaWordsWord[]>([])
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])
  const [error, setError] = useState<string | null>(null)
  const [swapLoading, setSwapLoading] = useState(false)
  const [arautoResponseLoading, setArautoResponseLoading] = useState(false)

  // Guardas contra respostas obsoletas: um poll de palpites iniciado antes do
  // toggle ser gravado no servidor ainda não traz a marca nova e, se for
  // aplicado depois, apaga a seleção optimista do jogador.
  const pendingToggles = useRef(0)
  const pendingWords = useRef<Set<string>>(new Set())
  const toggleConfirmedAt = useRef(0)
  const sessionSeq = useRef(0)
  const guessesSeq = useRef(0)
  const playersSeq = useRef(0)

  const supabase = createClient()

  const fetchWords = useCallback(async () => {
    const { data } = await supabase.rpc('get_vanawords_public', { p_session_id: session.id })
    if (data) setWords(data as VanaWordsWord[])
  }, [session.id])

  const fetchGuesses = useCallback(async () => {
    const seq = ++guessesSeq.current
    const startedAt = Date.now()
    const { data } = await supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
    if (!data || seq !== guessesSeq.current) return
    if (pendingToggles.current > 0 || startedAt < toggleConfirmedAt.current) return
    setGuesses(data as VanaWordsGuess[])
  }, [session.id])

  const fetchSession = useCallback(async () => {
    const seq = ++sessionSeq.current
    const { data } = await supabase.from('vanawords_sessions').select('*').eq('id', session.id).maybeSingle()
    if (data && seq === sessionSeq.current) setSession((s) => ({ ...s, ...(data as VanaWordsSession) }))
  }, [session.id])

  const fetchPlayers = useCallback(async () => {
    const seq = ++playersSeq.current
    const { data } = await supabase.from('vanawords_players').select('*').eq('session_id', session.id)
    if (data && seq === playersSeq.current) setPlayers(data as VanaWordsPlayer[])
  }, [session.id])

  useEffect(() => {
    fetchWords()
    fetchGuesses()

    const chan = supabase.channel(`vanawords-player-${session.id}-${myPlayer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_sessions', filter: `id=eq.${session.id}` },
        (payload) => { setSession((s) => ({ ...s, ...(payload.new as VanaWordsSession) })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_players', filter: `session_id=eq.${session.id}` },
        () => { fetchPlayers() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_guesses', filter: `session_id=eq.${session.id}` },
        () => { fetchGuesses() })
      .subscribe()

    // Reforço: sondagem periódica caso o realtime falhe (ex.: dica do Arauto que
    // muda current_phase de 'hinting' para 'guessing', ou mudança de equipa, que
    // não chegavam ao jogador em separadores em segundo plano).
    const poll = setInterval(() => {
      fetchSession()
      fetchGuesses()
      fetchPlayers()
      // Refetch directo das palavras: não depender só do board_version mudar
      // no estado da sessão para descobrir que uma palavra foi revelada.
      fetchWords()
    }, 2500)

    return () => { supabase.removeChannel(chan); clearInterval(poll) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version, session.status])

  // O id efectivo para identificar palpites: bot impersonado ou jogador real
  const effectivePlayerId = asBotId ?? myPlayer.id
  // Usa o estado em tempo real (players) para refletir mudanças de equipa feitas pelo host
  const myPlayerLive = players.find((p) => p.id === myPlayer.id) ?? myPlayer
  const myTeam = myPlayerLive.team as TeamId | null
  const teamLabel = myTeam ? TEAM_LABELS[myTeam] : null
  const isBotMode = !!asBotId

  // Abre a Vista de Arauto automaticamente assim que o host confirma os
  // Arautos — nem antes (ainda podem trocar durante a roleta) nem depois.
  useEffect(() => {
    if (session.status === 'arauto_ready' && myPlayerLive.is_arauto) {
      if (isBotMode) {
        // A página "as/[playerId]" decide PlayerView vs ArautoView no servidor
        // consoante o estado da sessão — um refresh basta para trocar de vista.
        router.refresh()
      } else {
        router.push(`/jogos/vana-words/${session.id}/arauto`)
      }
    }
  }, [session.status, myPlayerLive.is_arauto])

  async function handleWordClick(wordId: string) {
    // Ignora cliques repetidos na mesma palavra enquanto o toggle está em curso
    // (dois inserts em corrida criavam palpites duplicados impossíveis de desmarcar)
    if (pendingWords.current.has(wordId)) return
    setError(null)
    // Feedback optimista: mostra a seleção já, sem esperar pelo servidor
    const alreadySelected = guesses.some((g) => g.word_id === wordId && g.player_id === effectivePlayerId)
    setGuesses((gs) => alreadySelected
      ? gs.filter((g) => !(g.word_id === wordId && g.player_id === effectivePlayerId))
      : [...gs, {
          id: `optimistic-${wordId}-${effectivePlayerId}`,
          session_id: session.id,
          word_id: wordId,
          player_id: effectivePlayerId,
          created_at: new Date().toISOString(),
        }])

    pendingWords.current.add(wordId)
    pendingToggles.current++
    // Passa asBotId quando em modo de impersonação
    const res = await toggleGuess(session.id, wordId, asBotId)
    pendingToggles.current--
    pendingWords.current.delete(wordId)
    toggleConfirmedAt.current = Date.now()
    if (res?.error) setError(res.error)
    // Reconcilia com o servidor (cobre erros e corridas com o realtime, que pode falhar p/ DELETE)
    await fetchGuesses()
  }

  async function handleSwapRequest(requested: boolean) {
    setSwapLoading(true)
    await requestVanaWordsSwap(session.id, requested)
    await fetchPlayers()
    setSwapLoading(false)
  }

  async function handleArautoResponse(accept: boolean) {
    setArautoResponseLoading(true)
    await respondArautoChoice(session.id, accept)
    await fetchPlayers()
    setArautoResponseLoading(false)
  }

  // ── Lobby ────────────────────────────────────────────────────
  if (session.status === 'lobby') {
    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="flex flex-col items-center text-center gap-2">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-20 w-auto object-contain drop-shadow-2xl" />
          <p style={{ color: VW.mut }}>Olá, {myPlayer.display_name}!</p>
        </div>
        <div className="rounded-2xl p-6 border text-center" style={VW_PANEL_STYLE}>
          <p className="text-sm" style={{ color: VW.mut }}>A aguardar que o host inicie o jogo…</p>
          <div className="flex justify-center mt-3">
            <BlipDots className="text-2xl" style={{ color: VW.blue }} />
          </div>
        </div>
        <p className="text-xs" style={{ color: VW.mut, opacity: .7 }}>{players.length} jogador(es) no lobby</p>
      </div>
    )
  }

  // ── Team Preview ───────────────────────────────────────────
  if (session.status === 'team_preview') {
    const teamMates = players.filter((p) => p.team === myTeam)
    const otherTeam = myTeam === 'a' ? 'b' : 'a'
    const opponents = players.filter((p) => p.team === otherTeam)
    const opponentLabel = TEAM_LABELS[otherTeam]

    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="flex flex-col items-center text-center gap-2">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-16 w-auto object-contain drop-shadow-2xl" />
          {myTeam && (
            <p className={`${vwSerif.className} font-semibold text-lg mt-1`}>
              <TeamChip team={myTeam} label={`Estás na Equipa ${teamLabel}!`} />
            </p>
          )}
        </div>

        {myTeam && (
          <div className="w-full max-w-xs rounded-2xl p-4 border" style={teamPanelStyle(myTeam)}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: myTeam === 'a' ? VW.amber : VW.blue }}>
              A tua equipa
            </p>
            <div className="flex flex-wrap gap-2">
              {teamMates.map((p) => (
                <span
                  key={p.id}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={p.id === myPlayer.id ? { background: '#fff', color: '#12131f' } : { background: 'rgba(255,255,255,.08)', color: VW.ink }}
                >
                  {p.display_name}{p.id === myPlayer.id ? ' (tu)' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-xs rounded-2xl p-4 border opacity-70" style={teamPanelStyle(otherTeam)}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: otherTeam === 'a' ? VW.amber : VW.blue }}>
            Equipa {opponentLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {opponents.map((p) => (
              <span key={p.id} className="px-3 py-1.5 rounded-full text-sm font-semibold" style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.8)' }}>
                {p.display_name}
              </span>
            ))}
          </div>
        </div>

        {!isBotMode && (
          myPlayerLive.swap_requested ? (
            <div className="w-full max-w-xs rounded-2xl p-4 border text-center space-y-2" style={{ background: 'rgba(216,178,95,.1)', borderColor: 'rgba(216,178,95,.4)' }}>
              <p className="text-sm font-semibold" style={{ color: VW.gold }}>⏳ Pedido de troca enviado</p>
              <p className="text-xs" style={{ color: VW.gold, opacity: .7 }}>O host vai decidir se trocas de equipa.</p>
              <button
                onClick={() => handleSwapRequest(false)}
                disabled={swapLoading}
                className="text-xs underline disabled:opacity-50"
                style={{ color: VW.gold, opacity: .8 }}
              >
                Cancelar pedido
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSwapRequest(true)}
              disabled={swapLoading}
              className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ ...VW_PANEL_STYLE, color: VW.mut }}
            >
              🔁 Pedir para trocar de equipa
            </button>
          )
        )}

        <p className="text-sm" style={{ color: VW.mut }}>A aguardar que o host confirme as equipas…</p>
      </div>
    )
  }

  // ── Arauto Spin ────────────────────────────────────────────
  if (session.status === 'arauto_spin') {
    const amArautoNow = myPlayerLive.is_arauto

    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        {isBotMode && <BotBanner name={myPlayer.display_name} />}

        {!amArautoNow && (
          <>
            <div className="text-6xl" style={{ animation: 'spin 1s linear infinite' }}>🎰</div>
            <div className="text-center">
              <h2 className={`${vwSerif.className} text-2xl font-semibold`}>A Escolher os Arautos…</h2>
              <p className="text-sm mt-1" style={{ color: VW.mut }}>A roleta está a decidir quem guiará cada equipa</p>
            </div>
          </>
        )}

        {amArautoNow && (
          <div className="rounded-2xl p-4 text-center max-w-xs border" style={{ background: 'rgba(216,178,95,.1)', borderColor: 'rgba(216,178,95,.4)' }}>
            <Crown className="w-8 h-8 mx-auto mb-2" style={{ color: VW.gold }} />
            <p className="font-bold" style={{ color: VW.gold }}>A roleta escolheu-te como Arauto!</p>

            {myPlayerLive.arauto_response === 'pending' && (
              <>
                <p className="text-xs mt-1" style={{ color: VW.gold, opacity: .7 }}>Aceitas guiar a tua equipa?</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => handleArautoResponse(true)}
                    disabled={arautoResponseLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
                  >
                    Aceito
                  </button>
                  <button
                    onClick={() => handleArautoResponse(false)}
                    disabled={arautoResponseLoading}
                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    Prefiro não
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: VW.gold, opacity: .5 }}>É só uma preferência — o host vê e decide se gira a roleta outra vez.</p>
              </>
            )}
            {myPlayerLive.arauto_response === 'accepted' && (
              <p className="text-emerald-400 text-xs mt-1 font-semibold">✅ Disseste que aceitas. A aguardar o host…</p>
            )}
            {myPlayerLive.arauto_response === 'declined' && (
              <p className="text-xs mt-1 font-semibold" style={{ color: VW.gold, opacity: .7 }}>Disseste que preferias não ser. O host pode girar a roleta outra vez.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Arauto Ready ───────────────────────────────────────────
  if (session.status === 'arauto_ready') {
    const arautoA = players.find((p) => p.team === 'a' && p.is_arauto)
    const arautoB = players.find((p) => p.team === 'b' && p.is_arauto)
    const amArauto = myPlayerLive.is_arauto

    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <div className="text-center">
          <h2 className={`${vwSerif.className} text-2xl font-semibold`}>Os Arautos foram escolhidos!</h2>
          {myTeam && (
            <p className="text-sm mt-1 font-semibold">
              <TeamChip team={myTeam} label={`Equipa ${teamLabel}`} />
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="rounded-2xl p-4 border text-center min-w-[130px]" style={teamPanelStyle('a')}>
            <p className="text-xs font-bold mb-2" style={{ color: VW.amber }}>Arauto Leão</p>
            <p className="font-bold text-sm">{arautoA?.display_name ?? '—'}</p>
          </div>
          <div className="rounded-2xl p-4 border text-center min-w-[130px]" style={teamPanelStyle('b')}>
            <p className="text-xs font-bold mb-2" style={{ color: VW.blue }}>Arauto Águia</p>
            <p className="font-bold text-sm">{arautoB?.display_name ?? '—'}</p>
          </div>
        </div>
        {amArauto && (
          <div className="rounded-2xl p-4 text-center border" style={{ background: 'rgba(216,178,95,.1)', borderColor: 'rgba(216,178,95,.4)' }}>
            <Crown className="w-8 h-8 mx-auto mb-2" style={{ color: VW.gold }} />
            <p className="font-bold" style={{ color: VW.gold }}>És o Arauto!</p>
            {myPlayerLive.arauto_response === 'declined' && (
              <p className="text-xs mt-1" style={{ color: VW.gold, opacity: .7 }}>Pediste para não ser, mas o host decidiu manter-te.</p>
            )}
            {myPlayerLive.arauto_response === 'accepted' && (
              <p className="text-emerald-400 text-xs mt-1 font-semibold">✅ Aceitaste ser o Arauto</p>
            )}
            <p className="text-xs mt-2" style={{ color: VW.gold, opacity: .5 }}>A abrir a Vista de Arauto…</p>
          </div>
        )}
        <p className="text-sm" style={{ color: VW.mut }}>A aguardar que o host inicie…</p>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────
  if (session.status === 'playing') {
    const activeTeam = session.current_team as TeamId
    const isMyTurn = myTeam === activeTeam
    const amArauto = myPlayerLive.is_arauto
    const isHinting = session.current_phase === 'hinting'
    const activeLabel = TEAM_LABELS[activeTeam]

    const canVote = isMyTurn && !amArauto && !isHinting

    const wordsARevealed = words.filter((w) => w.team === 'a' && w.is_revealed).length
    const wordsBRevealed = words.filter((w) => w.team === 'b' && w.is_revealed).length

    return (
      <div className={`min-h-screen ${vwSans.className} p-3`} style={VW_SCREEN_STYLE}>
        <div className="max-w-lg mx-auto space-y-4">
          {isBotMode && <BotBanner name={myPlayer.display_name} />}

          {/* Badge da equipa */}
          {myTeam && (
            <div className="flex items-center justify-between px-4 py-2 rounded-xl border" style={teamPanelStyle(myTeam)}>
              <span className="font-bold text-sm">
                <TeamChip team={myTeam} label={`Equipa ${teamLabel}`} />
              </span>
              {amArauto && (
                <span className="text-xs font-bold flex items-center gap-1" style={{ color: VW.gold }}>
                  <Crown className="w-3 h-3" /> Arauto
                </span>
              )}
            </div>
          )}

          {/* Marcador */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl p-2 border" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'a' ? VW.amber : VW.pline }}>
              <p className="text-xs font-bold" style={{ color: VW.amber }}>Leão</p>
              <p className={`${vwSerif.className} font-semibold`}>{wordsARevealed}/5</p>
            </div>
            <div className="rounded-xl p-2 border" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'b' ? VW.blue : VW.pline }}>
              <p className="text-xs font-bold" style={{ color: VW.blue }}>Águia</p>
              <p className={`${vwSerif.className} font-semibold`}>{wordsBRevealed}/5</p>
            </div>
          </div>

          {/* Estado do turno */}
          <div
            className="rounded-xl p-3 border"
            style={{ ...teamPanelStyle(activeTeam, { strong: true }), ...(canVote ? VW_SOFT_PULSE : {}) }}
          >
            <p className="font-bold text-sm"><TeamChip team={activeTeam} label={`Vez da Equipa ${activeLabel}`} /></p>
            {isHinting ? (
              <p className="text-sm mt-0.5" style={{ color: VW.mut }}>A aguardar dica do Arauto…</p>
            ) : (
              <>
                <p className={`${vwSerif.className} text-lg font-semibold mt-1`}>
                  «{session.current_hint}» — {session.current_hint_number}
                </p>
                <p className="text-xs mt-0.5" style={{ color: activeTeam === 'a' ? VW.amber : VW.blue }}>
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
            disabled={!canVote}
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {isMyTurn && amArauto && isHinting && (
            <div className="rounded-xl p-3 text-center border" style={{ background: 'rgba(216,178,95,.1)', borderColor: 'rgba(216,178,95,.4)' }}>
              <p className="font-bold text-sm" style={{ color: VW.gold }}>É a tua vez de dar a dica!</p>
              <a
                href={`/jogos/vana-words/${session.id}/arauto`}
                className="mt-2 inline-block px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold text-sm shadow-lg shadow-yellow-900/30 active:scale-95 transition-transform"
              >
                Abrir Vista de Arauto
              </a>
            </div>
          )}
          {!isMyTurn && (
            <p className="text-sm text-center" style={{ color: VW.mut }}>A aguardar a tua vez…</p>
          )}
          {canVote && (
            <p className="text-xs text-center animate-pulse" style={{ color: VW.blue }}>
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

    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6 text-center`} style={VW_SCREEN_STYLE}>
        {isBotMode && <BotBanner name={myPlayer.display_name} />}
        <p className="text-7xl">{iWon ? '🏆' : winner === 'a' ? '🦁' : winner === 'b' ? '🦅' : '🏆'}</p>
        <h1 className={`${vwSerif.className} text-3xl font-semibold`}>
          {winner ? `Equipa ${label} venceu!` : 'Jogo terminado!'}
        </h1>
        {iWon ? (
          <p className="text-emerald-400 text-lg font-semibold">Parabéns! A tua equipa ganhou 100 XP e 50 Gold!</p>
        ) : (
          <p style={{ color: VW.mut }}>Boa sorte na próxima vez!</p>
        )}
        {session.win_reason === 'black_hit' && (
          <p className="text-red-400 text-sm">A palavra preta foi revelada! 💀</p>
        )}
        <p className="text-sm -mb-2" style={{ color: VW.mut }}>Todas as palavras:</p>
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
