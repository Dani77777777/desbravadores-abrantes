'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/utils/supabase/client'
import { WordGrid } from './WordGrid'
import { TeamRoulette } from './TeamRoulette'
import { TeamChip, Avatar, OverflowAvatar, BlipDots, initials } from './ui'
import { PlayerAvatar } from './PlayerAvatar'
import { VW, VW_SCREEN_STYLE, VW_PANEL_STYLE, VW_SOFT_PULSE, TEAM_GRADIENT, teamPanelStyle, vwSans, vwSerif } from './theme'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'

interface ProjectorViewProps {
  session: VanaWordsSession
  initialPlayers: VanaWordsPlayer[]
}

// ── Áudio (música por estado + SFX) — mesmo padrão do VanaQuest ──
const SOUNDS = '/sounds/VanaWords - soundboard'
const VQ_SOUNDS = '/sounds/VanaQuest - soundboard'
const sound = (file: string) => encodeURI(`${SOUNDS}/${file}`)
const vqSound = (file: string) => encodeURI(`${VQ_SOUNDS}/${file}`)

function trackForState(status: string, phase: string | null): string {
  switch (status) {
    case 'lobby':
      return sound('VanaWords - Lobby Theme.mp3')
    case 'team_preview':
      return sound('VanaWords - Gathering Banners.mp3')
    case 'arauto_spin':
      return sound('VanaWords - The Choosing.mp3')
    case 'arauto_ready':
      return sound('VanaWords - Heralds Rise.mp3')
    case 'playing':
      return phase === 'hinting'
        ? sound('VanaWords - The Arauto Thinks.mp3')
        : sound('VanaWords - Whispered Words.mp3')
    case 'finished':
      // Fanfare toca 1× e depois transita para Victory Feast (loop) no 'ended'
      return sound('VanaWords - Victory Fanfare.mp3')
    default:
      return ''
  }
}

export function ProjectorView({ session: initSession, initialPlayers }: ProjectorViewProps) {
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState<VanaWordsWord[]>([])
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])
  const [qrZoomed, setQrZoomed] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  const musicRef = useRef<HTMLAudioElement | null>(null)
  const currentTrackRef = useRef('')
  const sfxVoteRef = useRef<HTMLAudioElement | null>(null)
  const sfxHintRef = useRef<HTMLAudioElement | null>(null)
  const sfxCorrectRef = useRef<HTMLAudioElement | null>(null)
  const sfxWrongRef = useRef<HTMLAudioElement | null>(null)
  const sfxBlackRef = useRef<HTMLAudioElement | null>(null)
  const sfxArautoRef = useRef<HTMLAudioElement | null>(null)
  const sfxEarningRef = useRef<HTMLAudioElement | null>(null)

  const supabase = createClient()

  // Helper para tocar SFX (sempre — não depende de musicEnabled)
  function playSfx(ref: React.RefObject<HTMLAudioElement | null>) {
    const el = ref.current
    if (!el) return
    try {
      el.currentTime = 0
      el.play().catch(() => {})
    } catch {}
  }

  // Fanfare de vitória acaba → Victory Feast em loop
  function handleMusicEnded() {
    const el = musicRef.current
    if (!el) return
    const current = decodeURIComponent(currentTrackRef.current || '')
    if (current.includes('Victory Fanfare')) {
      const feast = sound('VanaWords - Victory Feast.mp3')
      currentTrackRef.current = feast
      el.src = feast
      el.loop = true
      el.volume = 0.5
      el.play().catch(() => {})
    }
  }

  // Criar elementos <audio> uma vez (sobrevivem a re-renders entre estados)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const make = (src: string, label: string) => {
      const a = new Audio()
      a.src = src
      a.preload = 'auto'
      a.addEventListener('error', () => {
        console.warn(`[VW] Failed to load ${label}:`, src, a.error)
      })
      return a
    }
    musicRef.current = make('', 'music')
    musicRef.current.addEventListener('ended', handleMusicEnded)
    sfxVoteRef.current = make(vqSound('player-answered.mp3'), 'sfx-vote')
    sfxHintRef.current = make(sound('sfx-hint-trumpet.mp3'), 'sfx-hint')
    sfxCorrectRef.current = make(sound('sfx-word-correct.mp3'), 'sfx-correct')
    sfxWrongRef.current = make(sound('sfx-word-wrong.mp3'), 'sfx-wrong')
    sfxBlackRef.current = make(sound('sfx-black-word.mp3'), 'sfx-black')
    sfxArautoRef.current = make(sound('sfx-arauto-chosen.mp3'), 'sfx-arauto')
    sfxEarningRef.current = make(vqSound('earning points.mp3'), 'sfx-earning')
    ;[sfxVoteRef, sfxHintRef, sfxCorrectRef, sfxWrongRef, sfxBlackRef, sfxArautoRef, sfxEarningRef].forEach((r) => {
      if (r.current) r.current.volume = 0.7
    })
    return () => {
      musicRef.current?.pause()
      musicRef.current?.removeEventListener('ended', handleMusicEnded)
      musicRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Desbloquear áudio na primeira interacção (necessário para autoplay)
  useEffect(() => {
    if (audioUnlocked) return
    const unlock = () => {
      setAudioUnlocked(true)
      const el = musicRef.current
      if (el && musicEnabled) {
        const next = trackForState(session.status, session.current_phase)
        if (next) {
          currentTrackRef.current = next
          el.src = next
          el.loop = session.status !== 'finished'
          el.volume = 0.5
          el.play().catch(() => {})
        }
      }
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [audioUnlocked, musicEnabled, session.status, session.current_phase])

  // Mudar de música conforme estado/fase e musicEnabled
  useEffect(() => {
    const el = musicRef.current
    if (!el) return

    if (!musicEnabled || !audioUnlocked) {
      el.pause()
      return
    }

    const next = trackForState(session.status, session.current_phase)
    if (!next) {
      el.pause()
      currentTrackRef.current = ''
      return
    }
    // Se a Feast já está a tocar no 'finished', não recomeçar a Fanfare
    const playingFeast = decodeURIComponent(currentTrackRef.current || '').includes('Victory Feast')
    if (session.status === 'finished' && playingFeast) {
      if (el.paused) el.play().catch(() => {})
      return
    }
    if (currentTrackRef.current !== next) {
      currentTrackRef.current = next
      el.src = next
      el.loop = session.status !== 'finished'
      el.volume = 0.5
      el.play().catch((err) => console.warn('[VW] Music play error:', err, 'src:', next))
    } else if (el.paused) {
      el.play().catch(() => {})
    }
  }, [session.status, session.current_phase, musicEnabled, audioUnlocked])

  // SFX: trompete do Arauto quando a dica chega (hinting → guessing)
  const prevPhaseRef = useRef<string | null>(initSession.current_phase)
  useEffect(() => {
    if (session.status === 'playing' && prevPhaseRef.current === 'hinting' && session.current_phase === 'guessing') {
      playSfx(sfxHintRef)
    }
    prevPhaseRef.current = session.current_phase
  }, [session.current_phase, session.status])

  // Equipa que está (ou esteve) a adivinhar — mantém-se até haver nova dica,
  // para classificar reveals que chegam depois do turno já ter mudado.
  const guessingTeamRef = useRef<TeamId | null>(null)
  useEffect(() => {
    if (session.current_phase === 'guessing' && session.current_team) {
      guessingTeamRef.current = session.current_team as TeamId
    }
  }, [session.current_phase, session.current_team])

  // SFX: palavra revelada (certa / errada / preta)
  const revealedRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const revealedNow = new Set(words.filter((w) => w.is_revealed).map((w) => w.id))
    if (revealedRef.current === null) {
      // Primeira carga: registar sem tocar (evita rajada de sons ao abrir a página)
      if (words.length > 0) revealedRef.current = revealedNow
      return
    }
    const prev = revealedRef.current
    const newOnes = words.filter((w) => w.is_revealed && !prev.has(w.id))
    revealedRef.current = revealedNow
    if (!newOnes.length) return
    const guessing = guessingTeamRef.current
    if (newOnes.some((w) => w.team === 'black')) playSfx(sfxBlackRef)
    else if (newOnes.some((w) => w.team === 'neutral' || (w.team && guessing && w.team !== guessing))) playSfx(sfxWrongRef)
    else playSfx(sfxCorrectRef)
  }, [words])

  // SFX: novo voto de um jogador
  const knownGuessesRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const now = new Set(guesses.map((g) => g.id))
    if (knownGuessesRef.current === null) {
      knownGuessesRef.current = now
      return
    }
    const prev = knownGuessesRef.current
    knownGuessesRef.current = now
    if (guesses.some((g) => !prev.has(g.id))) playSfx(sfxVoteRef)
  }, [guesses])

  // SFX: XP e Gold atribuídos
  const prevRewardsRef = useRef(initSession.rewards_awarded)
  useEffect(() => {
    if (!prevRewardsRef.current && session.rewards_awarded) playSfx(sfxEarningRef)
    prevRewardsRef.current = session.rewards_awarded
  }, [session.rewards_awarded])

  // Overlay para desbloquear áudio — renderizado fora da árvore de cada estado
  // (DOM directo via useEffect para sobreviver a qualquer return)
  useEffect(() => {
    if (audioUnlocked || typeof document === 'undefined') return

    const overlay = document.createElement('div')
    overlay.setAttribute('id', 'vw-audio-unlock')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;animation:vwFade 0.3s ease-out'
    overlay.innerHTML = `
      <style>@keyframes vwFade{from{opacity:0}to{opacity:1}}</style>
      <div style="background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.2);border-radius:24px;padding:32px 40px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;margin:0 16px">
        <div style="font-size:3rem;margin-bottom:12px">🔊</div>
        <p style="color:white;font-size:1.5rem;font-weight:900;margin:0">Clica para activar o áudio</p>
        <p style="color:#7dd3fc;font-size:0.875rem;margin-top:8px">Os browsers exigem uma interacção antes de tocar música</p>
      </div>
    `
    const handler = () => setAudioUnlocked(true)
    overlay.addEventListener('click', handler)
    document.body.appendChild(overlay)
    return () => {
      overlay.removeEventListener('click', handler)
      overlay.remove()
    }
  }, [audioUnlocked])

  // URL curto para o QR (/j/CODIGO → redireciona para o jogo): menos caracteres
  // = QR menos denso = leitura fácil à distância no projetor.
  // Calculado só no cliente via estado: se fosse derivado de `window` durante o
  // render, o SVG hidratava com o path do valor vazio do SSR e nunca era
  // corrigido (o React não repara atributos divergentes na hidratação).
  const [joinUrl, setJoinUrl] = useState('')
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/j/${session.code}`)
  }, [session.code])

  // Altura do viewport — dimensiona elementos com tamanho em px (avatares)
  // para o ecrã de jogo caber sempre, em qualquer resolução/zoom.
  const [viewportH, setViewportH] = useState(0)
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Recebe comandos do host (ampliar QR Code)
  useEffect(() => {
    const ch = supabase.channel(`vanawords-present-${session.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
      if (typeof payload?.musicEnabled === 'boolean') setMusicEnabled(payload.musicEnabled)
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

  // Avanço do SFX do Arauto = duração do próprio áudio, para o som começar
  // durante a desaceleração da roleta e terminar quando a escolha é revelada.
  const arautoSfxLeadMs = () => {
    const d = sfxArautoRef.current?.duration
    return d && isFinite(d) && d > 0 ? d * 1000 : 1500
  }
  // As duas roletas acabam quase juntas — não reiniciar o som se já está a tocar
  // (senão o segundo onFinale voltava a atrasá-lo).
  const playArautoSfx = () => {
    const el = sfxArautoRef.current
    if (!el || (!el.paused && !el.ended)) return
    try {
      el.currentTime = 0
      el.play().catch(() => {})
    } catch {}
  }

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
              onFinale={playArautoSfx}
              finaleLeadMs={arautoSfxLeadMs}
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
              onFinale={playArautoSfx}
              finaleLeadMs={arautoSfxLeadMs}
              instant={session.arauto_reveal_b === 'instant'}
            />
          )}
        </div>
      </div>
    )
  }

  if (session.status === 'lobby' || session.status === 'team_preview') {
    const isPreview = session.status === 'team_preview'
    // Dimensões em px proporcionais à altura do ecrã (QR não pode usar clamp de CSS)
    const qrSize = viewportH ? Math.round(Math.min(280, Math.max(160, viewportH * 0.3))) : 260
    const qrZoomSize = viewportH ? Math.round(Math.min(500, viewportH * 0.55)) : 500
    return (
      <div className={`h-[100dvh] overflow-hidden ${vwSans.className} flex flex-col items-center px-8 py-[clamp(1rem,3vh,3rem)] gap-[clamp(0.75rem,2.2vh,2rem)]`} style={VW_SCREEN_STYLE}>
        <div className="flex flex-col items-center text-center shrink-0">
          <img src="/images/VanaWords.png" alt="VanaWords" className="h-[clamp(4rem,13vh,8rem)] w-auto object-contain drop-shadow-2xl" />
          <p className="text-slate-400 text-[clamp(0.875rem,1.8vh,1.125rem)] mt-2">
            {isPreview ? 'A organizar as equipas…' : 'Junta-te ao jogo!'}
          </p>
        </div>

        {/* Código de entrada + QR Code em destaque */}
        {!isPreview && (
          <div className="flex flex-wrap items-center justify-center gap-[clamp(1rem,3vw,2rem)] shrink-0">
            <div className="rounded-3xl px-[clamp(1.5rem,4vw,3rem)] py-[clamp(0.75rem,2vh,1.5rem)] text-center border" style={VW_PANEL_STYLE}>
              <p className="text-[clamp(0.7rem,1.4vh,0.875rem)] uppercase tracking-widest mb-1" style={{ color: VW.mut }}>Código</p>
              {/* Mesma fonte do ecrã "Entrar no Jogo" — evita confundir letras */}
              <p className="text-[clamp(2.5rem,8vh,4.5rem)] font-black tracking-[0.3em]">{session.code}</p>
            </div>
            {joinUrl && (
              <div className="bg-white rounded-3xl p-[clamp(0.75rem,1.6vh,1.5rem)] shadow-2xl">
                <QRCodeSVG value={joinUrl} size={qrSize} />
              </div>
            )}
          </div>
        )}

        {/* Contador */}
        <div className="flex items-center gap-2 text-emerald-300 text-[clamp(1.125rem,2.4vh,1.5rem)] font-bold shrink-0">
          <span className="text-[clamp(1.5rem,3.6vh,2.25rem)]">{players.length}</span>
          <span className="text-slate-400 text-[clamp(0.875rem,1.8vh,1.125rem)] font-normal">
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
          <div className="grid grid-cols-2 gap-8 max-w-5xl w-full flex-1 min-h-0 overflow-y-auto content-start">
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
                        <PlayerAvatar
                          avatarUrl={p.avatar_url}
                          name={p.display_name}
                          className="w-7 h-7 rounded-full object-cover"
                          fallbackClassName="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-sm"
                        />
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
          <div className="flex flex-wrap justify-center gap-3 max-w-4xl flex-1 min-h-0 overflow-y-auto content-start">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-slate-600 bg-slate-800/60 text-white font-semibold text-lg animate-in fade-in zoom-in-95 duration-500"
              >
                <PlayerAvatar
                  avatarUrl={p.avatar_url}
                  name={p.display_name}
                  className="w-7 h-7 rounded-full object-cover"
                  fallbackClassName="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-sm"
                />
                {p.display_name}
              </div>
            ))}
          </div>
        )}

        {/* QR Code ampliado (controlado pelo host) */}
        {qrZoomed && !isPreview && joinUrl && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-[clamp(1.25rem,4vh,2.5rem)] shadow-2xl animate-in zoom-in-95 duration-500">
              <QRCodeSVG value={joinUrl} size={qrZoomSize} />
              <p className="text-center mt-[clamp(0.75rem,2vh,1.5rem)] text-[clamp(1.75rem,5vh,3rem)] font-black text-gray-900 tracking-widest">{session.code}</p>
              <p className="text-center text-gray-500 text-[clamp(0.875rem,1.8vh,1.125rem)] mt-2">Lê o código ou usa o código de entrada</p>
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
    const avatarSize = viewportH ? Math.max(30, Math.min(46, Math.round(viewportH * 0.05))) : 46

    return (
      <div className={`h-[100dvh] overflow-hidden ${vwSans.className} p-[clamp(0.625rem,1.6vh,1.5rem)] flex flex-col gap-[clamp(0.5rem,1.2vh,1rem)]`} style={VW_SCREEN_STYLE}>
        {/* Top bar */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <img src="/images/VanaWords.png" alt="VanaWords" className="h-[clamp(2.25rem,6vh,4rem)] w-auto object-contain rounded-2xl" />
            <div>
              <div className={`${vwSerif.className} text-[clamp(1.125rem,2.8vh,1.875rem)] font-semibold`}>VanaWords</div>
              <div className="text-[clamp(0.65rem,1.4vh,0.875rem)]" style={{ color: VW.mut }}>Clube de Desbravadores de Abrantes</div>
            </div>
          </div>

          {/* Marcador */}
          <div className="flex gap-[clamp(0.5rem,1vw,1rem)]">
            <div className="rounded-2xl px-[clamp(0.75rem,1.5vw,1.5rem)] py-[clamp(0.375rem,1vh,1rem)] border min-w-[clamp(110px,11vw,170px)]" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'a' && !isFinished ? VW.amber : VW.pline }}>
              <p className="font-bold text-[clamp(0.8rem,1.8vh,1.125rem)]"><TeamChip team="a" /></p>
              <p className={`${vwSerif.className} text-[clamp(1.375rem,3.6vh,2.25rem)] font-semibold mt-0.5`}>
                {wordsAFound} <span className="text-[clamp(0.9rem,2.4vh,1.5rem)]" style={{ color: VW.mut }}>/ {totalA}</span>
              </p>
            </div>
            <div
              className="rounded-2xl px-[clamp(0.75rem,1.5vw,1.5rem)] py-[clamp(0.375rem,1vh,1rem)] border min-w-[clamp(110px,11vw,170px)]"
              style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'b' && !isFinished ? 'rgba(63,140,255,.5)' : VW.pline, ...(activeTeam === 'b' && !isFinished ? VW_SOFT_PULSE : {}) }}
            >
              <p className="font-bold text-[clamp(0.8rem,1.8vh,1.125rem)]"><TeamChip team="b" /></p>
              <p className={`${vwSerif.className} text-[clamp(1.375rem,3.6vh,2.25rem)] font-semibold mt-0.5`}>
                {wordsBFound} <span className="text-[clamp(0.9rem,2.4vh,1.5rem)]" style={{ color: VW.mut }}>/ {totalB}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Dica activa */}
        {!isFinished && activeTeam && (
          <div className="rounded-2xl px-[clamp(1rem,2vw,2rem)] py-[clamp(0.5rem,1.3vh,1.25rem)] border flex items-center gap-4 shrink-0" style={teamPanelStyle(activeTeam, { strong: true })}>
            <span className="w-4 h-4 rounded-[5px] shrink-0" style={{ background: TEAM_GRADIENT[activeTeam] }} />
            <div className="flex-1">
              <p className={`${vwSerif.className} text-[clamp(1rem,2.5vh,1.5rem)] font-semibold flex items-center gap-2`}>
                Vez da equipa {TEAM_LABELS[activeTeam]}
                {isHinting && (
                  <span className="text-[clamp(0.8rem,1.9vh,1.125rem)] font-normal flex items-center gap-1" style={{ color: VW.mut }}>
                    o arauto está a dar a dica<BlipDots className="ml-1" />
                  </span>
                )}
              </p>
              {!isHinting && session.current_hint && (
                <p className={`${vwSerif.className} text-[clamp(1.5rem,4.4vh,3rem)] font-semibold tracking-wide mt-1`}>
                  «{session.current_hint}»
                  <span className="ml-4 text-[clamp(1rem,2.9vh,1.875rem)]" style={{ color: VW.mut }}>×{session.current_hint_number}</span>
                </p>
              )}
            </div>
            {!isHinting ? (
              <p className={`${vwSerif.className} text-[clamp(1.25rem,3.5vh,2.25rem)] font-semibold`} style={{ color: activeTeam === 'a' ? VW.amber : VW.blue }}>
                {session.guesses_remaining} restante(s)
              </p>
            ) : (
              <span
                className="text-[clamp(0.65rem,1.4vh,0.875rem)] font-bold uppercase tracking-widest rounded-full px-4 py-2 border"
                style={{ color: activeTeam === 'a' ? VW.amber : VW.blue, borderColor: activeTeam === 'a' ? 'rgba(245,166,35,.5)' : 'rgba(63,140,255,.5)' }}
              >
                A jogar
              </span>
            )}
          </div>
        )}

        {/* Grelha — flex-1 + min-h-0 para a grelha esticar/encolher e caber sempre no ecrã */}
        <div className="flex-1 min-h-0 flex flex-col">
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
        <div className="grid grid-cols-2 gap-4 shrink-0">
          {(['a', 'b'] as TeamId[]).map((tid) => {
            const team = tid === 'a' ? teamA : teamB
            const arauto = tid === 'a' ? arautoA : arautoB
            const isWinner = isFinished && winner === tid
            const ordered = arauto ? [arauto, ...team.filter((p) => p.id !== arauto.id)] : team
            const visible = ordered.slice(0, 4)
            const overflow = ordered.length - visible.length
            return (
              <div key={tid} className="rounded-2xl px-4 py-[clamp(0.375rem,1vh,1rem)] border flex items-center gap-6" style={isWinner ? teamPanelStyle(tid, { strong: true }) : VW_PANEL_STYLE}>
                <div className="min-w-[clamp(120px,12vw,170px)]">
                  <p className={`${vwSerif.className} text-[clamp(0.9rem,2.1vh,1.25rem)] font-semibold`} style={{ color: tid === 'a' ? VW.amber : VW.blue }}>
                    Equipa {TEAM_LABELS[tid]}{isWinner && ' 🏆'}
                  </p>
                  <p className="text-[clamp(0.7rem,1.5vh,0.875rem)] mt-0.5" style={{ color: VW.mut }}>Arauto: {arauto?.display_name ?? '—'}</p>
                </div>
                <div className="flex gap-3 items-center ml-auto flex-wrap">
                  {visible.map((p) => (
                    <Avatar key={p.id} size={avatarSize} initials={initials(p.display_name)} team={tid} isArauto={p.id === arauto?.id} avatarUrl={p.avatar_url} />
                  ))}
                  {overflow > 0 && <OverflowAvatar size={avatarSize} count={overflow} />}
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
