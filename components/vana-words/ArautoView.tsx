'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitHint } from '@/lib/actions/vana-words'
import { WordGrid } from './WordGrid'
import { TEAM_LABELS, TEAM_COLORS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'
import { Crown } from 'lucide-react'

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
    // As cores só são reveladas ao Arauto depois do host iniciar o jogo
    if (session.status !== 'playing') return
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

    return () => { supabase.removeChannel(chan) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version, session.status])

  const myTeam = myPlayer.team as TeamId
  const colors = TEAM_COLORS[myTeam]
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
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.badge}`}>
          <Crown className={`w-5 h-5 ${colors.text}`} />
          <p className={`font-black text-sm ${colors.text}`}>
            {myTeam === 'a' ? '🦁' : '🦅'} Arauto da Equipa {label}
          </p>
        </div>

        <div className="text-7xl">🙋</div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-2xl font-black text-white">Vai ter com o Host!</h2>
          <p className="text-slate-300">
            Dirige-te ao apresentador junto ao ecrã grande. Quando todos os Arautos
            estiverem prontos, o host revela as grelhas com as cores.
          </p>
        </div>

        <div className="flex gap-2 mt-2">
          <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-slate-500 text-xs">A aguardar que o host revele as grelhas…</p>
      </div>
    )
  }

  if (session.status !== 'playing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex items-center justify-center">
        <p className="text-slate-400">A aguardar início do jogo…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-2 sm:p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.badge}`}>
          <Crown className={`w-5 h-5 ${colors.text}`} />
          <div>
            <p className={`font-black text-sm ${colors.text}`}>
              {myTeam === 'a' ? '🦁' : '🦅'} Arauto da Equipa {label}
            </p>
            <p className="text-white/60 text-xs">{myPlayer.display_name}</p>
          </div>
        </div>

        {/* Legenda de cores */}
        <div className="flex gap-2 text-xs flex-wrap">
          <span className="px-2 py-1 rounded bg-amber-600 text-white font-semibold">🦁 Leão</span>
          <span className="px-2 py-1 rounded bg-blue-600 text-white font-semibold">🦅 Águia</span>
          <span className="px-2 py-1 rounded bg-stone-950 text-red-300 font-semibold">💀 Preta</span>
          <span className="px-2 py-1 rounded bg-stone-700 text-stone-300 font-semibold">— Neutra</span>
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
          <div className={`bg-slate-800/80 rounded-2xl p-5 border ${colors.border} space-y-3`}>
            <p className={`font-bold ${colors.text} text-sm`}>A tua dica para a Equipa {label}</p>
            <p className="text-slate-400 text-xs -mt-1">Uma só palavra, que não esteja no quadro.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 min-w-0 bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base sm:text-lg font-bold border border-slate-600 uppercase placeholder:normal-case placeholder:text-slate-400"
                placeholder="Palavra-dica…"
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitHint() }}
              />
              <input
                type="number"
                min={1}
                max={9}
                className="w-16 shrink-0 bg-slate-700 text-white rounded-xl px-2 py-2.5 text-base sm:text-lg font-bold border border-slate-600 text-center"
                value={hintNumber}
                onChange={(e) => setHintNumber(parseInt(e.target.value) || 1)}
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleSubmitHint}
              disabled={loading || !hintInput.trim()}
              className={`w-full py-3 rounded-xl font-bold text-white disabled:opacity-40 transition-colors ${colors.bg}`}
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
          <div className={`bg-slate-800/60 rounded-xl p-4 border ${colors.badge} text-center`}>
            <p className={`font-bold ${colors.text}`}>Dica: «{session.current_hint}» — {session.current_hint_number}</p>
            <p className="text-slate-400 text-sm mt-1">A tua equipa está a votar. Aguarda o host confirmar.</p>
          </div>
        )}

        {!isMyTurn && (
          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700 text-center">
            <p className="text-slate-400">É a vez da outra equipa. Observa a grelha.</p>
            {session.current_hint && session.current_phase === 'guessing' ? (
              <p className="text-white/70 text-sm mt-1">
                Dica deles: «{session.current_hint}» — {session.current_hint_number}
              </p>
            ) : (
              <p className="text-slate-500 text-sm mt-1">O Arauto deles está a pensar na dica…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
