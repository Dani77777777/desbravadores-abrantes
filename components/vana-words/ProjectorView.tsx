'use client'

import { useEffect, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/utils/supabase/client'
import { WordGrid } from './WordGrid'
import { TeamRoulette } from './TeamRoulette'
import { TeamChip, Avatar, OverflowAvatar, BlipDots, initials } from './ui'
import { VW, VW_SCREEN_STYLE, VW_PANEL_STYLE, VW_SOFT_PULSE, TEAM_GRADIENT, teamPanelStyle, vwSans, vwSerif } from './theme'
import { TEAM_LABELS } from '@/types/vana-words'
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
  const [qrZoomed, setQrZoomed] = useState(false)

  const supabase = createClient()

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/jogos/vana-words?code=${session.code}`
    : ''

  // Recebe comandos do host (ampliar QR Code)
  useEffect(() => {
    const ch = supabase.channel(`vanawords-present-${session.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session.id])

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

    // Reforço: sondagem periódica caso o realtime falhe (dica/fase do turno)
    const poll = setInterval(() => {
      supabase.from('vanawords_sessions').select('*').eq('id', session.id).maybeSingle()
        .then(({ data }) => { if (data) setSession((s) => ({ ...s, ...(data as VanaWordsSession) })) })
      supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
        .then(({ data }) => { if (data) setGuesses(data as VanaWordsGuess[]) })
      // Refetch directo das palavras: não depender só do board_version mudar
      // no estado da sessão para descobrir que uma palavra foi revelada.
      fetchWords()
    }, 2500)

    return () => { supabase.removeChannel(chan); clearInterval(poll) }
  }, [session.id])

  useEffect(() => { fetchWords() }, [session.board_version, session.status])

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
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center gap-10 p-8`} style={VW_SCREEN_STYLE}>
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className={`${vwSerif.className} text-3xl font-semibold`}>A escolher os Arautos…</p>

        <div className="flex gap-12 flex-wrap justify-center scale-125">
          {arautoA && teamA.length > 0 && (
            <TeamRoulette
              key={`proj-a-${arautoA.id}`}
              team="a"
              candidates={teamA}
              winner={arautoA}
              onDone={() => {}}
              instant={session.arauto_reveal_a === 'instant'}
            />
          )}
          {arautoB && teamB.length > 0 && (
            <TeamRoulette
              key={`proj-b-${arautoB.id}`}
              team="b"
              candidates={teamB}
              winner={arautoB}
              onDone={() => {}}
              instant={session.arauto_reveal_b === 'instant'}
            />
          )}
        </div>
      </div>
    )
  }

  if (session.status === 'lobby' || session.status === 'team_preview') {
    const isPreview = session.status === 'team_preview'
    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center px-8 py-12 gap-8`} style={VW_SCREEN_STYLE}>
        <div className="flex flex-col items-center text-center">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-32 w-auto object-contain drop-shadow-2xl" />
          <p className="text-slate-400 text-lg mt-2">
            {isPreview ? 'A organizar as equipas…' : 'Junta-te ao jogo!'}
          </p>
        </div>

        {/* Código de entrada + QR Code em destaque */}
        {!isPreview && (
          <div className="flex flex-wrap items-center justify-center gap-8">
            <div className="rounded-3xl px-12 py-6 text-center border" style={VW_PANEL_STYLE}>
              <p className="text-sm uppercase tracking-widest mb-1" style={{ color: VW.mut }}>Código</p>
              <p className={`${vwSerif.className} text-7xl font-semibold tracking-[0.3em]`}>{session.code}</p>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-2xl">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
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
        ) : isPreview ? (
          <div className="grid grid-cols-2 gap-8 max-w-5xl w-full">
            {(['a', 'b'] as const).map((tid) => {
              const teamPlayers = players.filter((p) => p.team === tid)
              return (
                <div key={tid} className="rounded-3xl border p-6" style={teamPanelStyle(tid, { strong: true })}>
                  <p className={`${vwSerif.className} font-semibold text-2xl text-center mb-4`}>
                    <TeamChip team={tid} />
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {teamPlayers.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800/70 text-white font-semibold text-lg animate-in fade-in zoom-in-95 duration-500"
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-sm">
                            {p.display_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {p.display_name}
                      </div>
                    ))}
                    {teamPlayers.length === 0 && (
                      <p className="text-slate-500 text-sm">Vazia</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-slate-600 bg-slate-800/60 text-white font-semibold text-lg animate-in fade-in zoom-in-95 duration-500"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-sm">
                    {p.display_name.charAt(0).toUpperCase()}
                  </span>
                )}
                {p.display_name}
              </div>
            ))}
          </div>
        )}

        {/* QR Code ampliado (controlado pelo host) */}
        {qrZoomed && !isPreview && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-10 shadow-2xl animate-in zoom-in-95 duration-500">
              <QRCodeSVG value={joinUrl} size={500} />
              <p className="text-center mt-6 text-5xl font-black text-gray-900 tracking-widest">{session.code}</p>
              <p className="text-center text-gray-500 text-lg mt-2">Lê o código ou usa o código de entrada</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (session.status === 'arauto_ready') {
    return (
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center gap-10`} style={VW_SCREEN_STYLE}>
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <div className="flex gap-12">
          <div className="rounded-3xl p-8 text-center min-w-[220px] border" style={teamPanelStyle('a', { strong: true })}>
            <p className="text-sm font-bold mb-3 uppercase tracking-widest" style={{ color: VW.amber }}>Arauto Leão</p>
            <p className={`${vwSerif.className} text-3xl font-semibold`}>{arautoA?.display_name ?? '—'}</p>
          </div>
          <div className="rounded-3xl p-8 text-center min-w-[220px] border" style={teamPanelStyle('b', { strong: true })}>
            <p className="text-sm font-bold mb-3 uppercase tracking-widest" style={{ color: VW.blue }}>Arauto Águia</p>
            <p className={`${vwSerif.className} text-3xl font-semibold`}>{arautoB?.display_name ?? '—'}</p>
          </div>
        </div>
        <p className="text-lg" style={{ color: VW.mut }}>Os Arautos estão a preparar-se…</p>
      </div>
    )
  }

  if (session.status === 'playing' || session.status === 'finished') {
    const isFinished = session.status === 'finished'
    const winner = session.winner_team as TeamId | null

    return (
      <div className={`min-h-screen ${vwSans.className} p-6 flex flex-col gap-4`} style={VW_SCREEN_STYLE}>
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/images/VanaWords.png" alt="VanaWords" className="h-16 w-auto object-contain rounded-2xl" />
            <div>
              <div className={`${vwSerif.className} text-3xl font-semibold`}>VanaWords</div>
              <div className="text-sm" style={{ color: VW.mut }}>Clube de Desbravadores de Abrantes</div>
            </div>
          </div>

          {/* Marcador */}
          <div className="flex gap-4">
            <div className="rounded-2xl px-6 py-4 border min-w-[170px]" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'a' && !isFinished ? VW.amber : VW.pline }}>
              <p className="font-bold text-lg"><TeamChip team="a" /></p>
              <p className={`${vwSerif.className} text-4xl font-semibold mt-0.5`}>
                {wordsAFound} <span className="text-2xl" style={{ color: VW.mut }}>/ {totalA}</span>
              </p>
            </div>
            <div
              className="rounded-2xl px-6 py-4 border min-w-[170px]"
              style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'b' && !isFinished ? 'rgba(63,140,255,.5)' : VW.pline, ...(activeTeam === 'b' && !isFinished ? VW_SOFT_PULSE : {}) }}
            >
              <p className="font-bold text-lg"><TeamChip team="b" /></p>
              <p className={`${vwSerif.className} text-4xl font-semibold mt-0.5`}>
                {wordsBFound} <span className="text-2xl" style={{ color: VW.mut }}>/ {totalB}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Dica activa */}
        {!isFinished && activeTeam && (
          <div className="rounded-2xl px-8 py-5 border flex items-center gap-4" style={teamPanelStyle(activeTeam, { strong: true })}>
            <span className="w-4 h-4 rounded-[5px] shrink-0" style={{ background: TEAM_GRADIENT[activeTeam] }} />
            <div className="flex-1">
              <p className={`${vwSerif.className} text-2xl font-semibold flex items-center gap-2`}>
                Vez da equipa {TEAM_LABELS[activeTeam]}
                {isHinting && (
                  <span className="text-lg font-normal flex items-center gap-1" style={{ color: VW.mut }}>
                    o arauto está a dar a dica<BlipDots className="ml-1" />
                  </span>
                )}
              </p>
              {!isHinting && session.current_hint && (
                <p className={`${vwSerif.className} text-5xl font-semibold tracking-wide mt-2`}>
                  «{session.current_hint}»
                  <span className="ml-4 text-3xl" style={{ color: VW.mut }}>×{session.current_hint_number}</span>
                </p>
              )}
            </div>
            {!isHinting ? (
              <p className={`${vwSerif.className} text-4xl font-semibold`} style={{ color: activeTeam === 'a' ? VW.amber : VW.blue }}>
                {session.guesses_remaining} restante(s)
              </p>
            ) : (
              <span
                className="text-sm font-bold uppercase tracking-widest rounded-full px-4 py-2 border"
                style={{ color: activeTeam === 'a' ? VW.amber : VW.blue, borderColor: activeTeam === 'a' ? 'rgba(245,166,35,.5)' : 'rgba(63,140,255,.5)' }}
              >
                A jogar
              </span>
            )}
          </div>
        )}

        {/* Grelha */}
        <div className="flex-1 flex flex-col justify-center">
          <WordGrid
            words={words}
            guesses={guesses}
            players={players}
            showColors={isFinished}
            disabled
            large
          />
        </div>

        {/* Equipas e Arautos em baixo */}
        <div className="grid grid-cols-2 gap-4">
          {(['a', 'b'] as TeamId[]).map((tid) => {
            const team = tid === 'a' ? teamA : teamB
            const arauto = tid === 'a' ? arautoA : arautoB
            const isWinner = isFinished && winner === tid
            const ordered = arauto ? [arauto, ...team.filter((p) => p.id !== arauto.id)] : team
            const visible = ordered.slice(0, 4)
            const overflow = ordered.length - visible.length
            return (
              <div key={tid} className="rounded-2xl p-4 border flex items-center gap-6" style={isWinner ? teamPanelStyle(tid, { strong: true }) : VW_PANEL_STYLE}>
                <div className="min-w-[170px]">
                  <p className={`${vwSerif.className} text-xl font-semibold`} style={{ color: tid === 'a' ? VW.amber : VW.blue }}>
                    Equipa {TEAM_LABELS[tid]}{isWinner && ' 🏆'}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: VW.mut }}>Arauto: {arauto?.display_name ?? '—'}</p>
                </div>
                <div className="flex gap-3 items-center ml-auto flex-wrap">
                  {visible.map((p) => (
                    <Avatar key={p.id} initials={initials(p.display_name)} team={tid} isArauto={p.id === arauto?.id} avatarUrl={p.avatar_url} />
                  ))}
                  {overflow > 0 && <OverflowAvatar count={overflow} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ecrã de vitória */}
        {isFinished && winner && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="rounded-3xl p-12 border-4 text-center" style={{ background: '#0d1533', borderColor: winner === 'a' ? VW.amber : VW.blue }}>
              <p className="text-8xl mb-4">{winner === 'a' ? '🦁' : '🦅'}</p>
              <h2 className={`${vwSerif.className} text-4xl font-semibold`}>Equipa {TEAM_LABELS[winner]}</h2>
              <p className="text-2xl mt-2" style={{ color: 'rgba(238,241,248,.7)' }}>venceu!</p>
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
