'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitHint } from '@/lib/actions/vana-words'
import { WordGrid } from './WordGrid'
import { TeamChip, BlipDots } from './ui'
import { VW, VW_SCREEN_STYLE, VW_PANEL_STYLE, TEAM_CARD_PALETTE, TEAM_GRADIENT, teamPanelStyle, vwSans, vwSerif } from './theme'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'
import { Crown, Minus, Plus } from 'lucide-react'

interface ArautoViewProps {
  session: VanaWordsSession
  myPlayer: VanaWordsPlayer
  initialPlayers: VanaWordsPlayer[]
}

export function ArautoView({ session: initSession, myPlayer, initialPlayers }: ArautoViewProps) {
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState<VanaWordsWord[]>([])
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])
  const [hintInput, setHintInput] = useState('')
  const [hintNumber, setHintNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const supabase = createClient()

  const fetchWords = useCallback(async () => {
    // As cores só são reveladas ao Arauto a partir do início do jogo (e no fim)
    if (session.status !== 'playing' && session.status !== 'finished') return
    const { data } = await supabase.rpc('get_vanawords_with_teams', { p_session_id: session.id })
    if (data) setWords(data as VanaWordsWord[])
  }, [session.id, session.status])

  useEffect(() => {
    fetchWords()
    supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
      .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })

    const chan = supabase.channel(`vanawords-arauto-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const next = payload.new as VanaWordsSession
          setSession((s) => ({ ...s, ...next }))
          // Reset submitted when phase changes back to hinting
          if (next.current_phase === 'hinting') setSubmitted(false)
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_guesses', filter: `session_id=eq.${session.id}` },
        () => {
          supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
            .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })
        })
      .subscribe()

    // Reforço: sondagem periódica caso o realtime falhe (fase do turno / fim do jogo)
    const poll = setInterval(() => {
      supabase.from('vanawords_sessions').select('*').eq('id', session.id).maybeSingle()
        .then(({ data }) => {
          if (!data) return
          const next = data as VanaWordsSession
          setSession((s) => ({ ...s, ...next }))
          if (next.current_phase === 'hinting') setSubmitted(false)
        })
      supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
        .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })
    }, 2500)

    return () => { supabase.removeChannel(chan); clearInterval(poll) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version, session.status])

  const myTeam = myPlayer.team as TeamId
  const label = TEAM_LABELS[myTeam]
  const isMyTurn = session.current_team === myTeam
  const isHinting = session.current_phase === 'hinting'

  async function handleSubmitHint() {
    if (!hintInput.trim()) return
    setLoading(true)
    setError(null)
    const res = await submitHint(session.id, hintInput.trim(), hintNumber)
    if (res.error) {
      setError(res.error)
    } else {
      setSubmitted(true)
      setHintInput('')
    }
    setLoading(false)
  }

  // Antes do jogo começar, o Arauto NÃO vê a grelha — vai ter com o host
  if (session.status === 'arauto_ready') {
    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6 text-center`} style={VW_SCREEN_STYLE}>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={teamPanelStyle(myTeam)}>
          <Crown className="w-5 h-5" style={{ color: myTeam === 'a' ? VW.amber : VW.blue }} />
          <p className="font-black text-sm"><TeamChip team={myTeam} label={`Arauto da Equipa ${label}`} /></p>
        </div>

        <div className="text-7xl">🙋</div>
        <div className="space-y-2 max-w-sm">
          <h2 className={`${vwSerif.className} text-2xl font-semibold`}>Vai ter com o Host!</h2>
          <p style={{ color: 'rgba(238,241,248,.85)' }}>
            Dirige-te ao apresentador junto ao ecrã grande. Quando todos os Arautos
            estiverem prontos, o host revela as grelhas com as cores.
          </p>
        </div>

        <BlipDots className="text-3xl" style={{ color: VW.blue }} />
        <p className="text-xs" style={{ color: VW.mut }}>A aguardar que o host revele as grelhas…</p>
      </div>
    )
  }

  // Fim do jogo
  if (session.status === 'finished') {
    const winner = session.winner_team as TeamId | null
    const iWon = winner && myTeam === winner
    const winnerLabel = winner ? TEAM_LABELS[winner] : null
    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6 text-center`} style={VW_SCREEN_STYLE}>
        <p className="text-7xl">{iWon ? '🏆' : winner === 'a' ? '🦁' : winner === 'b' ? '🦅' : '🏆'}</p>
        <h1 className={`${vwSerif.className} text-3xl font-semibold`}>
          {winner ? `Equipa ${winnerLabel} venceu!` : 'Jogo terminado!'}
        </h1>
        {iWon ? (
          <p className="text-emerald-400 text-lg font-semibold">Parabéns! A tua equipa ganhou 100 XP e 50 Gold!</p>
        ) : (
          <p style={{ color: VW.mut }}>Boa sorte na próxima vez!</p>
        )}
        {session.win_reason === 'black_hit' && (
          <p className="text-red-400 text-sm">A palavra preta foi revelada! 💀</p>
        )}
        <div className="w-full max-w-2xl">
          <p className="text-sm mb-2" style={{ color: VW.mut }}>Todas as palavras:</p>
          <WordGrid words={words} guesses={[]} players={players} showColors disabled />
        </div>
      </div>
    )
  }

  if (session.status !== 'playing') {
    return (
      <div className={`min-h-screen ${vwSans.className} flex items-center justify-center`} style={VW_SCREEN_STYLE}>
        <p style={{ color: VW.mut }}>A aguardar início do jogo…</p>
      </div>
    )
  }

  return (
    <div className={`min-h-screen overflow-x-hidden ${vwSans.className} p-2 sm:p-4`} style={VW_SCREEN_STYLE}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={teamPanelStyle(myTeam)}>
          <Crown className="w-5 h-5" style={{ color: myTeam === 'a' ? VW.amber : VW.blue }} />
          <div>
            <p className="font-black text-sm"><TeamChip team={myTeam} label={`Arauto da Equipa ${label}`} /></p>
            <p className="text-xs" style={{ color: 'rgba(238,241,248,.6)' }}>{myPlayer.display_name}</p>
          </div>
        </div>

        {/* Legenda de cores */}
        <div className="flex gap-2 text-xs flex-wrap">
          {(['a', 'b', 'black', 'neutral'] as const).map((t) => (
            <span
              key={t}
              className="px-2 py-1 rounded font-semibold"
              style={{ background: TEAM_CARD_PALETTE[t].fill, color: TEAM_CARD_PALETTE[t].text }}
            >
              {t === 'a' ? 'Leão' : t === 'b' ? 'Águia' : t === 'black' ? 'Preta' : 'Neutra'}
            </span>
          ))}
        </div>

        {/* Grelha com cores */}
        <WordGrid
          words={words}
          guesses={guesses}
          players={players}
          showColors={true}
          disabled
        />

        {/* Painel de dica */}
        {isMyTurn && isHinting && !submitted && (
          <div className="rounded-2xl p-5 border space-y-3" style={teamPanelStyle(myTeam)}>
            <p className="font-bold text-sm"><TeamChip team={myTeam} label={`A tua dica para a Equipa ${label}`} /></p>
            <p className="text-xs -mt-1" style={{ color: VW.mut }}>Uma só palavra, que não esteja no quadro.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-base sm:text-lg font-bold border uppercase placeholder:normal-case"
                style={{ background: '#0b1226', borderColor: VW.pline, color: VW.ink }}
                placeholder="Palavra-dica…"
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitHint() }}
              />
              <div className="flex shrink-0 items-stretch rounded-xl border overflow-hidden" style={{ background: '#0b1226', borderColor: VW.pline }}>
                <button
                  type="button"
                  onClick={() => setHintNumber((n) => Math.max(1, n - 1))}
                  disabled={hintNumber <= 1}
                  aria-label="Diminuir"
                  className="px-3 flex items-center hover:bg-white/5 disabled:opacity-30"
                  style={{ color: VW.mut }}
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className={`${vwSerif.className} w-9 flex items-center justify-center text-lg font-semibold tabular-nums select-none`}>
                  {hintNumber}
                </span>
                <button
                  type="button"
                  onClick={() => setHintNumber((n) => Math.min(5, n + 1))}
                  disabled={hintNumber >= 5}
                  aria-label="Aumentar"
                  className="px-3 flex items-center hover:bg-white/5 disabled:opacity-30"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleSubmitHint}
              disabled={loading || !hintInput.trim()}
              className="w-full py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
              style={{ background: TEAM_GRADIENT[myTeam], color: myTeam === 'a' ? '#1e1305' : '#f5f9ff' }}
            >
              {loading ? 'A enviar…' : 'Enviar Dica'}
            </button>
          </div>
        )}

        {isMyTurn && isHinting && submitted && (
          <div className="bg-emerald-900/40 border border-emerald-500/40 rounded-2xl p-4 text-center">
            <p className="text-emerald-400 font-bold">Dica enviada! A tua equipa está a adivinhar…</p>
          </div>
        )}

        {isMyTurn && !isHinting && (
          <div className="rounded-xl p-4 border text-center" style={teamPanelStyle(myTeam)}>
            <p className="font-bold"><TeamChip team={myTeam} label={`Dica: «${session.current_hint}» — ${session.current_hint_number}`} /></p>
            <p className="text-sm mt-1" style={{ color: VW.mut }}>A tua equipa está a votar. Aguarda o host confirmar.</p>
          </div>
        )}

        {!isMyTurn && (
          <div className="rounded-xl p-4 border text-center" style={VW_PANEL_STYLE}>
            <p style={{ color: VW.mut }}>É a vez da outra equipa. Observa a grelha.</p>
            {session.current_hint && session.current_phase === 'guessing' ? (
              <p className="text-sm mt-1" style={{ color: 'rgba(238,241,248,.7)' }}>
                Dica deles: «{session.current_hint}» — {session.current_hint_number}
              </p>
            ) : (
              <p className="text-sm mt-1" style={{ color: VW.mut }}>O Arauto deles está a pensar na dica…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
