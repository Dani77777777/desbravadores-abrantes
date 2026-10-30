'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/utils/supabase/client'
import type { VanaSketchSession, VanaSketchPlayer, VanaSketchGuess } from '@/types/vana-sketch'
import { useSketchSession, useSketchPlayers, useSketchGuesses } from './useSketchSession'
import { CanvasViewer } from './CanvasViewer'
import { SketchAvatar, CountdownBadge, MaskedWord } from './ui'
import { useSketchAudio } from './useSketchAudio'
import { CinematicPodium } from '@/components/game-podium/CinematicPodium'
import { VS, VS_SCREEN_STYLE, vsHand, vsSans } from './theme'
import { Pencil, Users } from 'lucide-react'

interface ProjectorViewProps {
  session: VanaSketchSession
  initialPlayers: VanaSketchPlayer[]
}

export function ProjectorView({ session: initialSession, initialPlayers }: ProjectorViewProps) {
  const [session, setSession] = useState<VanaSketchSession>(initialSession)
  const [players, setPlayers] = useState<VanaSketchPlayer[]>(initialPlayers)
  const [guesses, setGuesses] = useState<VanaSketchGuess[]>([])

  useSketchSession(session.id, (row) => setSession(row as VanaSketchSession))
  useSketchPlayers(session.id, (rows) => setPlayers(rows as VanaSketchPlayer[]))
  useSketchGuesses(session.id, session.round_number, (rows) => setGuesses(rows as VanaSketchGuess[]))

  // URL curto para o QR (/j/CODIGO → redireciona para o jogo): menos caracteres
  // = QR menos denso = leitura fácil à distância no projetor. Calculado só no
  // cliente (estado) para não divergir na hidratação do SSR.
  const [joinUrl, setJoinUrl] = useState('')
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/j/${session.code}`)
  }, [session.code])

  // Recebe comandos do host (ampliar QR Code, ligar/desligar a música)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`vanasketch-present-${session.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
      if (typeof payload?.musicEnabled === 'boolean') setMusicEnabled(payload.musicEnabled)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session.id])

  const { audioUnlocked, unlock } = useSketchAudio(session, guesses, musicEnabled)

  const drawer = players.find((p) => p.id === session.drawer_player_id)
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players])

  return (
    <div className={`min-h-screen ${vsSans.className}`} style={VS_SCREEN_STYLE}>
      {/* Durante o jogo, num ecrã grande, tudo cabe na altura do ecrã (sem scroll) */}
      <div className={`mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-6 ${
        session.status === 'playing' ? 'lg:h-screen lg:overflow-hidden' : ''
      }`}>
        {/* Cabeçalho */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/VanaSketch.png" alt="VanaSketch" className="h-12 w-12 object-contain" />
            <div>
              <p className={`${vsHand.className} text-3xl font-bold leading-none`}>VanaSketch</p>
              {session.status === 'playing' && (
                <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: VS.mut }}>
                  Ronda {session.round_number} de {session.total_rounds}
                </p>
              )}
            </div>
          </div>
          {session.status !== 'finished' && (
            <div className="flex items-center gap-3 rounded-2xl border px-4 py-2" style={{ background: VS.panel, borderColor: VS.pline }}>
              <span className="text-sm font-bold uppercase tracking-wider" style={{ color: VS.mut }}>Código</span>
              <span className="font-mono text-3xl font-black tracking-[0.25em]" style={{ color: VS.amber }}>{session.code}</span>
            </div>
          )}
        </header>

        {session.status === 'lobby' && <ProjectorLobby session={session} players={players} joinUrl={joinUrl} />}

        {session.status === 'playing' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:grid-rows-[minmax(0,1fr)]">
            {/* Quadro */}
            <div className="relative flex min-h-0 flex-col gap-3">
              <div className="flex items-center justify-between rounded-2xl border px-5 py-3" style={{ background: VS.panel, borderColor: VS.pline }}>
                <div className="flex items-center gap-3">
                  {drawer && (
                    <>
                      <SketchAvatar name={drawer.display_name} avatarUrl={drawer.avatar_url} size={40} highlight />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>A desenhar</p>
                        <p className="font-bold leading-none">{drawer.display_name.split(' ')[0]}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {session.phase === 'drawing' && <MaskedWord masked={session.word_masked} size="lg" />}
                  {session.phase === 'round_end' && <MaskedWord masked={null} revealed={session.revealed_word} size="lg" />}
                  {session.phase === 'drawing' && <CountdownBadge endsAt={session.round_ends_at} size="lg" />}
                </div>
              </div>

              {session.phase === 'choosing' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border" style={{ background: VS.panel, borderColor: VS.pline }}>
                  <Pencil className="h-16 w-16 animate-bounce" style={{ color: VS.amber }} />
                  <p className={`${vsHand.className} text-5xl font-bold`}>
                    {drawer?.display_name.split(' ')[0] ?? '…'} está a escolher a palavra…
                  </p>
                </div>
              ) : (
                // O quadro é 4:3: no ecrã grande ocupa a largura OU a altura que
                // sobra, a que for mais pequena (antes saía pelo fundo do ecrã)
                <div className="flex min-h-0 flex-1 justify-center lg:[container-type:size]">
                  <div className="w-full lg:w-[min(100cqw,calc(100cqh*4/3))]">
                    <CanvasViewer
                      sessionId={session.id}
                      roundNumber={session.round_number}
                      canvasVersion={session.canvas_version}
                      className="rounded-2xl border-4 border-white/20 shadow-2xl"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Barra lateral: feed + placar */}
            <div className="flex min-h-0 flex-col gap-4">
              <GuessFeed guesses={guesses} playerById={playerById} />
              <Scoreboard sorted={sorted} drawerId={session.drawer_player_id} />
            </div>
          </div>
        )}

      </div>

      {/* Pódio cinematográfico em ecrã inteiro */}
      {session.status === 'finished' && (
        <div className="fixed inset-0 z-40">
          <CinematicPodium
            entries={sorted.map((p) => ({ id: p.id, name: p.display_name.split(' ')[0], avatarUrl: p.avatar_url, points: p.score }))}
            backgroundStyle={VS_SCREEN_STYLE}
            ringOffsetClassName="ring-offset-[#0d0a22]"
            displayFontClassName={vsHand.className}
          />
        </div>
      )}

      {/* QR Code ampliado (controlado pelo host) */}
      {qrZoomed && session.status !== 'finished' && joinUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="rounded-3xl bg-white p-[clamp(1.25rem,4vh,2.5rem)] shadow-2xl animate-in zoom-in-95 duration-500">
            <QRCodeSVG value={joinUrl} size={480} className="h-auto w-full max-h-[55vh]" />
            <p className="mt-[clamp(0.75rem,2vh,1.5rem)] text-center font-mono text-[clamp(1.75rem,5vh,3rem)] font-black tracking-widest text-gray-900">
              {session.code}
            </p>
            <p className="mt-2 text-center text-[clamp(0.875rem,1.8vh,1.125rem)] text-gray-500">
              Lê o QR ou usa o código de entrada
            </p>
          </div>
        </div>
      )}

      {/* Os browsers só deixam tocar música depois de um clique na página */}
      {!audioUnlocked && (
        <button
          type="button"
          onClick={unlock}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md animate-in fade-in duration-300"
        >
          <span className="max-w-md rounded-3xl border-2 px-10 py-8 text-center shadow-2xl" style={{ background: VS.panel, borderColor: VS.pline }}>
            <span className="mb-3 block text-5xl">🔊</span>
            <span className={`${vsHand.className} block text-4xl font-bold`}>Clica para ativar o som e o ecrã inteiro</span>
            <span className="mt-2 block text-sm" style={{ color: VS.mut }}>Os browsers exigem um clique antes de tocar música</span>
          </span>
        </button>
      )}
    </div>
  )
}

function ProjectorLobby({ session, players, joinUrl }: { session: VanaSketchSession; players: VanaSketchPlayer[]; joinUrl: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <img src="/images/VanaSketch.png" alt="" className="h-36 w-auto object-contain drop-shadow-2xl" />
      <div className="flex flex-wrap items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: VS.mut }}>
            Entra em <span className="text-white">desbravadores-abrantes</span> → Jogos → VanaSketch
          </p>
          <p className="mt-3 font-mono text-8xl font-black tracking-[0.3em]" style={{ color: VS.amber }}>
            {session.code}
          </p>
        </div>
        {joinUrl && (
          <div className="rounded-3xl bg-white p-5 shadow-2xl">
            <QRCodeSVG value={joinUrl} size={220} />
          </div>
        )}
      </div>
      <div className="flex max-w-4xl flex-wrap items-center justify-center gap-3">
        {players.length === 0 ? (
          <p className="flex items-center gap-2" style={{ color: VS.mut }}>
            <Users className="h-5 w-5" /> À espera de artistas…
          </p>
        ) : (
          players.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-4 animate-in fade-in zoom-in duration-300">
              <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={34} />
              <span className="font-bold">{p.display_name.split(' ')[0]}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function GuessFeed({ guesses, playerById }: { guesses: VanaSketchGuess[]; playerById: Map<string, VanaSketchPlayer> }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
  }, [guesses.length])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border" style={{ background: VS.panel, borderColor: VS.pline }}>
      <p className="border-b px-4 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut, borderColor: VS.pline }}>
        Palpites
      </p>
      <div ref={ref} className="flex-1 space-y-1.5 overflow-y-auto p-4 text-lg" style={{ minHeight: 200 }}>
        {guesses.length === 0 && <p className="text-sm" style={{ color: VS.mut }}>Ainda sem palpites…</p>}
        {guesses.map((g) => {
          const name = playerById.get(g.player_id)?.display_name.split(' ')[0] ?? '?'
          return g.is_correct ? (
            <p key={g.id} className="font-black" style={{ color: VS.teal }}>✓ {name} acertou! +{g.points}</p>
          ) : (
            <p key={g.id} className="text-white/85">
              <span className="font-bold" style={{ color: VS.mut }}>{name}:</span> {g.guess_text}
            </p>
          )
        })}
      </div>
    </div>
  )
}

function Scoreboard({ sorted, drawerId }: { sorted: VanaSketchPlayer[]; drawerId: string | null }) {
  return (
    <div className="rounded-2xl border" style={{ background: VS.panel, borderColor: VS.pline }}>
      <p className="border-b px-4 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut, borderColor: VS.pline }}>
        Placar
      </p>
      <div className="max-h-[320px] space-y-1 overflow-y-auto p-3">
        {sorted.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5" style={{ background: i === 0 ? 'rgba(255,179,71,.1)' : undefined }}>
            <span className="w-6 text-center text-sm font-black" style={{ color: VS.mut }}>{i + 1}</span>
            <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={30} highlight={p.id === drawerId} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {p.display_name.split(' ')[0]}
              {p.id === drawerId && <Pencil className="ml-1.5 inline h-3.5 w-3.5" style={{ color: VS.amber }} />}
            </span>
            <span className="font-black tabular-nums" style={{ color: VS.amber }}>{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
