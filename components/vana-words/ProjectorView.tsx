'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { WordGrid } from './WordGrid'
import { TeamRoulette } from './TeamRoulette'
import { TEAM_LABELS, TEAM_COLORS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'

interface ProjectorViewProps {
  session: VanaWordsSession
  initialPlayers: VanaWordsPlayer[]
}

export function ProjectorView({ session: initSession, initialPlayers }: ProjectorViewProps) {
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState<VanaWordsWord[]>([])
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])

  const supabase = createClient()

  const fetchWords = useCallback(async () => {
    const { data } = await supabase.rpc('get_vanawords_public', { p_session_id: session.id })
    if (data) setWords(data as VanaWordsWord[])
  }, [session.id])

  useEffect(() => {
    fetchWords()
    supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
      .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })

    const chan = supabase.channel(`vanawords-projector-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_sessions', filter: `id=eq.${session.id}` },
        (payload) => { setSession((s) => ({ ...s, ...(payload.new as VanaWordsSession) })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_players', filter: `session_id=eq.${session.id}` },
        () => {
          supabase.from('vanawords_players').select('*').eq('session_id', session.id)
            .then(({ data }) => { if (data) setPlayers(data as VanaWordsPlayer[]) })
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_guesses', filter: `session_id=eq.${session.id}` },
        () => {
          supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
            .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })
        })
      .subscribe()

    return () => { supabase.removeChannel(chan) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version])

  const teamA = players.filter((p) => p.team === 'a')
  const teamB = players.filter((p) => p.team === 'b')
  const arautoA = players.find((p) => p.team === 'a' && p.is_arauto)
  const arautoB = players.find((p) => p.team === 'b' && p.is_arauto)

  const wordsAFound = words.filter((w) => w.team === 'a' && w.is_revealed).length
  const wordsBFound = words.filter((w) => w.team === 'b' && w.is_revealed).length
  // O RPC público esconde a equipa das palavras ainda não reveladas, logo não dá
  // para contar o total a partir das palavras. Cada equipa tem sempre 5 palavras.
  const totalA = 5
  const totalB = 5

  const activeTeam = session.current_team as TeamId | null
  const isHinting = session.current_phase === 'hinting'

  if (session.status === 'arauto_spin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center gap-10 p-8">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className="text-white text-3xl font-black">A escolher os Arautos…</p>

        <div className="flex gap-12 flex-wrap justify-center scale-125">
          {arautoA && teamA.length > 0 && (
            <TeamRoulette
              key={`proj-a-${arautoA.id}`}
              team="a"
              candidates={teamA}
              winner={arautoA}
              onDone={() => {}}
            />
          )}
          {arautoB && teamB.length > 0 && (
            <TeamRoulette
              key={`proj-b-${arautoB.id}`}
              team="b"
              candidates={teamB}
              winner={arautoB}
              onDone={() => {}}
            />
          )}
        </div>
      </div>
    )
  }

  if (session.status === 'lobby' || session.status === 'team_preview') {
    const isPreview = session.status === 'team_preview'
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center px-8 py-12 gap-8">
        <div className="flex flex-col items-center text-center">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-32 w-auto object-contain drop-shadow-2xl" />
          <p className="text-slate-400 text-lg mt-2">
            {isPreview ? 'A organizar as equipas…' : 'Junta-te ao jogo!'}
          </p>
        </div>

        {/* Código de entrada em destaque */}
        {!isPreview && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-3xl px-12 py-6 text-center">
            <p className="text-slate-400 text-sm uppercase tracking-widest mb-1">Código</p>
            <p className="text-7xl font-black text-white tracking-[0.3em]">{session.code}</p>
          </div>
        )}

        {/* Contador */}
        <div className="flex items-center gap-2 text-emerald-300 text-2xl font-bold">
          <span className="text-4xl">{players.length}</span>
          <span className="text-slate-400 text-lg font-normal">
            {players.length === 1 ? 'jogador na sala' : 'jogadores na sala'}
          </span>
        </div>

        {/* Grelha de jogadores a entrar */}
        {players.length === 0 ? (
          <div className="flex gap-4 mt-4">
            <span className="inline-block w-4 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-4 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-4 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
            {players.map((p) => {
              const teamColor = p.team === 'a'
                ? 'border-amber-500 bg-amber-500/10'
                : p.team === 'b'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 bg-slate-800/60'
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl border ${teamColor} text-white font-semibold text-lg animate-in fade-in zoom-in-95 duration-500`}
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-sm">
                      {p.display_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {p.team === 'a' && <span>🦁</span>}
                  {p.team === 'b' && <span>🦅</span>}
                  {p.display_name}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (session.status === 'arauto_ready') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center gap-10">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <div className="flex gap-12">
          <div className="bg-amber-600/20 border border-amber-500 rounded-3xl p-8 text-center min-w-[220px]">
            <p className="text-amber-400 text-sm font-bold mb-3 uppercase tracking-widest">🦁 Arauto Leão</p>
            <p className="text-white text-3xl font-black">{arautoA?.display_name ?? '—'}</p>
          </div>
          <div className="bg-blue-600/20 border border-blue-500 rounded-3xl p-8 text-center min-w-[220px]">
            <p className="text-blue-400 text-sm font-bold mb-3 uppercase tracking-widest">🦅 Arauto Águia</p>
            <p className="text-white text-3xl font-black">{arautoB?.display_name ?? '—'}</p>
          </div>
        </div>
        <p className="text-slate-400 text-lg">Os Arautos estão a preparar-se…</p>
      </div>
    )
  }

  if (session.status === 'playing' || session.status === 'finished') {
    const isFinished = session.status === 'finished'
    const winner = session.winner_team as TeamId | null

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-6 flex flex-col gap-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-12 w-auto object-contain" />

          {/* Marcador */}
          <div className="flex gap-4">
            <div className={`bg-slate-800/80 rounded-2xl px-8 py-3 border-2 ${activeTeam === 'a' && !isFinished ? 'border-amber-500 shadow-amber-500/30 shadow-lg' : 'border-slate-700'}`}>
              <p className="text-amber-400 text-base font-bold">🦁 Leão</p>
              <p className="text-white text-4xl font-black">{wordsAFound}/{totalA}</p>
            </div>
            <div className={`bg-slate-800/80 rounded-2xl px-8 py-3 border-2 ${activeTeam === 'b' && !isFinished ? 'border-blue-500 shadow-blue-500/30 shadow-lg' : 'border-slate-700'}`}>
              <p className="text-blue-400 text-base font-bold">🦅 Águia</p>
              <p className="text-white text-4xl font-black">{wordsBFound}/{totalB}</p>
            </div>
          </div>
        </div>

        {/* Dica activa */}
        {!isFinished && activeTeam && (
          <div className={`rounded-2xl px-8 py-5 border ${TEAM_COLORS[activeTeam].badge} flex items-center justify-between`}>
            <div>
              <p className={`text-xl font-bold ${TEAM_COLORS[activeTeam].text}`}>
                {activeTeam === 'a' ? '🦁' : '🦅'} Equipa {TEAM_LABELS[activeTeam]}
                {' — '}{isHinting ? 'A dar dica…' : 'A adivinhar'}
              </p>
              {!isHinting && session.current_hint && (
                <p className="text-white text-5xl font-black tracking-wide mt-2">
                  «{session.current_hint}»
                  <span className="text-slate-400 ml-4 text-3xl">×{session.current_hint_number}</span>
                </p>
              )}
            </div>
            {!isHinting && (
              <p className={`text-4xl font-black ${TEAM_COLORS[activeTeam].text}`}>
                {session.guesses_remaining} restante(s)
              </p>
            )}
          </div>
        )}

        {/* Grelha */}
        <div className="flex-1 flex flex-col justify-center">
          <WordGrid
            words={words}
            guesses={guesses}
            players={players}
            showColors={false}
            disabled
            large
          />
        </div>

        {/* Equipas e Arautos em baixo */}
        <div className="grid grid-cols-2 gap-4">
          {(['a', 'b'] as TeamId[]).map((tid) => {
            const team = tid === 'a' ? teamA : teamB
            const arauto = tid === 'a' ? arautoA : arautoB
            const colors = TEAM_COLORS[tid]
            const isWinner = isFinished && winner === tid
            return (
              <div key={tid} className={`bg-slate-800/60 rounded-2xl p-4 border ${isWinner ? colors.border : 'border-slate-700'}`}>
                <p className={`text-lg font-bold mb-2 ${colors.text}`}>
                  {tid === 'a' ? '🦁' : '🦅'} Equipa {TEAM_LABELS[tid]}
                  {isWinner && ' 🏆'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {team.map((p) => (
                    <span key={p.id} className={`text-lg ${p.is_arauto ? `font-bold ${colors.text}` : 'text-white/70'}`}>
                      {p.is_arauto ? '👑 ' : ''}{p.display_name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ecrã de vitória */}
        {isFinished && winner && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className={`bg-slate-900 rounded-3xl p-12 border-4 ${TEAM_COLORS[winner].border} text-center`}>
              <p className="text-8xl mb-4">{winner === 'a' ? '🦁' : '🦅'}</p>
              <h2 className="text-4xl font-black text-white">Equipa {TEAM_LABELS[winner]}</h2>
              <p className="text-2xl text-white/70 mt-2">venceu!</p>
              {session.win_reason === 'black_hit' && (
                <p className="text-red-400 mt-3">A palavra preta foi revelada 💀</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
