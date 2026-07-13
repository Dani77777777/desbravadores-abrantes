'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { chooseSketchWord, submitSketchGuess } from '@/lib/actions/vana-sketch'
import type { VanaSketchSession, VanaSketchPlayer, VanaSketchGuess } from '@/types/vana-sketch'
import { useSketchSession, useSketchPlayers, useSketchGuesses } from './useSketchSession'
import { DrawingCanvas } from './DrawingCanvas'
import { CanvasViewer } from './CanvasViewer'
import { SketchAvatar, CountdownBadge, MaskedWord, useCountdown } from './ui'
import { VS, VS_SCREEN_STYLE, vsHand, vsSans } from './theme'
import { Pencil, Send, Check, Trophy, Users, Sparkles } from 'lucide-react'

interface PlayerViewProps {
  session: VanaSketchSession
  myPlayer: VanaSketchPlayer
  initialPlayers: VanaSketchPlayer[]
}

export function PlayerView({ session: initialSession, myPlayer, initialPlayers }: PlayerViewProps) {
  const [session, setSession] = useState<VanaSketchSession>(initialSession)
  const [players, setPlayers] = useState<VanaSketchPlayer[]>(initialPlayers)
  const [guesses, setGuesses] = useState<VanaSketchGuess[]>([])

  useSketchSession(session.id, (row) => setSession(row as VanaSketchSession))
  useSketchPlayers(session.id, (rows) => setPlayers(rows as VanaSketchPlayer[]))
  useSketchGuesses(session.id, session.round_number, (rows) => setGuesses(rows as VanaSketchGuess[]))

  const me = players.find((p) => p.id === myPlayer.id) ?? myPlayer
  const isDrawer = session.drawer_player_id === me.id
  const drawer = players.find((p) => p.id === session.drawer_player_id)
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const iGuessedCorrect = guesses.some((g) => g.player_id === me.id && g.is_correct)

  return (
    <div className={`min-h-screen ${vsSans.className}`} style={VS_SCREEN_STYLE}>
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 p-4">
        {/* Cabeçalho */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/images/VanaSketch.png" alt="VanaSketch" className="h-9 w-9 object-contain" />
            <div>
              <p className={`${vsHand.className} text-xl font-bold leading-none`}>VanaSketch</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: VS.mut }}>
                {session.status === 'playing'
                  ? `Ronda ${session.round_number}/${session.total_rounds}`
                  : session.status === 'lobby' ? `Sala ${session.code}` : 'Fim de jogo'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session.status === 'playing' && session.phase === 'drawing' && (
              <CountdownBadge endsAt={session.round_ends_at} />
            )}
            <div className="rounded-xl border px-3 py-1.5 text-right" style={{ background: VS.panel, borderColor: VS.pline }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: VS.mut }}>Pontos</p>
              <p className="text-lg font-black leading-none tabular-nums">{me.score}</p>
            </div>
          </div>
        </header>

        {session.status === 'lobby' && <LobbyView session={session} players={players} meId={me.id} />}

        {session.status === 'playing' && session.phase === 'choosing' && (
          isDrawer
            ? <WordChoiceView sessionId={session.id} roundNumber={session.round_number} />
            : <WaitingChoiceView drawerName={drawer?.display_name ?? '…'} />
        )}

        {session.status === 'playing' && session.phase === 'drawing' && (
          isDrawer ? (
            <DrawerView session={session} />
          ) : (
            <GuesserView
              session={session}
              guesses={guesses}
              playerById={playerById}
              iGuessedCorrect={iGuessedCorrect}
            />
          )
        )}

        {session.status === 'playing' && session.phase === 'round_end' && (
          <RoundEndView session={session} guesses={guesses} playerById={playerById} drawer={drawer} meId={me.id} />
        )}

        {session.status === 'finished' && <PodiumView players={players} meId={me.id} />}
      </div>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────
function LobbyView({ session, players, meId }: { session: VanaSketchSession; players: VanaSketchPlayer[]; meId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <img src="/images/VanaSketch.png" alt="" className="h-28 w-auto object-contain drop-shadow-2xl" />
      <div>
        <p className={`${vsHand.className} text-3xl font-bold`}>Estás dentro! 🎨</p>
        <p className="mt-1 text-sm" style={{ color: VS.mut }}>À espera que o líder comece o jogo…</p>
      </div>
      <div className="w-full rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
        <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>
          <Users className="h-3.5 w-3.5" /> {players.length} jogador{players.length !== 1 ? 'es' : ''}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3">
              <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={26} highlight={p.id === meId} />
              <span className="text-xs font-semibold">{p.display_name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Desenhador: escolher palavra ──────────────────────────────
function WordChoiceView({ sessionId, roundNumber }: { sessionId: string; roundNumber: number }) {
  const [options, setOptions] = useState<string[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let loaded = false
    const supabase = createClient()
    const load = async () => {
      if (loaded) return
      const { data } = await supabase.rpc('get_vanasketch_drawer_info', { p_session_id: sessionId })
      if (!cancelled && data && data.length > 0) {
        loaded = true
        setOptions((data[0].word_options as string[]) ?? [])
      }
    }
    load()
    // Reintenta enquanto as opções não chegam (ex.: RPC ainda a propagar)
    const t = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [sessionId, roundNumber])

  async function pick(i: number) {
    setPicking(true)
    setError(null)
    const res = await chooseSketchWord(sessionId, i)
    if (res.error) { setError(res.error); setPicking(false) }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <p className={`${vsHand.className} text-4xl font-bold`} style={{ color: VS.pink }}>É a tua vez de desenhar!</p>
        <p className="mt-2 text-sm" style={{ color: VS.mut }}>Escolhe uma palavra — ninguém mais a vê.</p>
      </div>
      {!options ? (
        <p style={{ color: VS.mut }}>A carregar palavras…</p>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {options.map((w, i) => (
            <button
              key={i}
              type="button"
              disabled={picking}
              onClick={() => pick(i)}
              className={`${vsHand.className} w-full rounded-2xl border-2 border-white/15 bg-white/5 py-4 text-3xl font-bold transition-all hover:border-pink-400/60 hover:bg-pink-500/10 active:scale-[0.98] disabled:opacity-50`}
            >
              {w}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function WaitingChoiceView({ drawerName }: { drawerName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Pencil className="h-12 w-12 animate-bounce" style={{ color: VS.amber }} />
      <p className={`${vsHand.className} text-3xl font-bold`}>
        {drawerName.split(' ')[0]} está a escolher a palavra…
      </p>
      <p className="text-sm" style={{ color: VS.mut }}>Prepara os dedos para escrever palpites!</p>
    </div>
  )
}

// ── Desenhador: a desenhar ────────────────────────────────────
function DrawerView({ session }: { session: VanaSketchSession }) {
  const [word, setWord] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.rpc('get_vanasketch_drawer_info', { p_session_id: session.id }).then(({ data }) => {
      if (!cancelled && data && data.length > 0) setWord(data[0].word)
    })
    return () => { cancelled = true }
  }, [session.id, session.round_number])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border px-4 py-2" style={{ background: 'rgba(255,93,162,.1)', borderColor: 'rgba(255,93,162,.35)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>Desenha:</p>
        <span className={`${vsHand.className} text-3xl font-bold`} style={{ color: VS.pink }}>{word ?? '…'}</span>
      </div>
      <DrawingCanvas
        sessionId={session.id}
        roundNumber={session.round_number}
        canvasVersion={session.canvas_version}
      />
    </div>
  )
}

// ── Palpiteiro ────────────────────────────────────────────────
function GuesserView({
  session,
  guesses,
  playerById,
  iGuessedCorrect,
}: {
  session: VanaSketchSession
  guesses: VanaSketchGuess[]
  playerById: Map<string, VanaSketchPlayer>
  iGuessedCorrect: boolean
}) {
  const [guess, setGuess] = useState('')
  const [sending, setSending] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const left = useCountdown(session.round_ends_at)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [guesses.length])

  const send = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const text = guess.trim()
    if (!text || sending) return
    setSending(true)
    setGuess('')
    const res = await submitSketchGuess(session.id, text)
    if (res.correct) {
      setFlash('correct')
    } else if (!res.error) {
      setFlash('wrong')
      setTimeout(() => setFlash(null), 600)
    }
    setSending(false)
  }, [guess, sending, session.id])

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-center gap-3 rounded-2xl border px-4 py-2" style={{ background: VS.panel, borderColor: VS.pline }}>
        <MaskedWord masked={session.word_masked} />
      </div>

      <CanvasViewer
        sessionId={session.id}
        roundNumber={session.round_number}
        canvasVersion={session.canvas_version}
        className="rounded-2xl border-4 border-white/20 shadow-2xl"
      />

      {/* Feed de palpites */}
      <div
        ref={feedRef}
        className="min-h-[72px] flex-1 space-y-1 overflow-y-auto rounded-2xl border p-3 text-sm"
        style={{ background: VS.panel, borderColor: VS.pline, maxHeight: 160 }}
      >
        {guesses.length === 0 && (
          <p className="text-center text-xs" style={{ color: VS.mut }}>Os palpites aparecem aqui…</p>
        )}
        {guesses.map((g) => {
          const name = playerById.get(g.player_id)?.display_name.split(' ')[0] ?? '?'
          return g.is_correct ? (
            <p key={g.id} className="font-bold" style={{ color: VS.teal }}>
              ✓ {name} acertou! <span className="text-xs font-semibold opacity-70">+{g.points}</span>
            </p>
          ) : (
            <p key={g.id} className="text-white/80">
              <span className="font-semibold" style={{ color: VS.mut }}>{name}:</span> {g.guess_text}
            </p>
          )
        })}
      </div>

      {/* Caixa de palpite */}
      {iGuessedCorrect || flash === 'correct' ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border py-4 font-bold" style={{ background: 'rgba(62,207,178,.12)', borderColor: 'rgba(62,207,178,.4)', color: VS.teal }}>
          <Check className="h-5 w-5" /> Acertaste! Espera pelo fim da ronda…
        </div>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input
            className={`flex-1 rounded-2xl border bg-slate-900/70 px-4 py-3.5 font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
              flash === 'wrong' ? 'border-red-400 ring-red-400/40 animate-pulse' : 'border-slate-700 focus:border-pink-500 focus:ring-pink-500/30'
            }`}
            placeholder="O teu palpite…"
            value={guess}
            maxLength={60}
            disabled={sending || left === 0}
            onChange={(e) => setGuess(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending || !guess.trim() || left === 0}
            className="flex items-center justify-center rounded-2xl px-5 font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      )}
    </div>
  )
}

// ── Fim de ronda ──────────────────────────────────────────────
function RoundEndView({
  session,
  guesses,
  playerById,
  drawer,
  meId,
}: {
  session: VanaSketchSession
  guesses: VanaSketchGuess[]
  playerById: Map<string, VanaSketchPlayer>
  drawer: VanaSketchPlayer | undefined
  meId: string
}) {
  const correct = guesses.filter((g) => g.is_correct)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <Sparkles className="h-10 w-10" style={{ color: VS.amber }} />
      <div>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: VS.mut }}>A palavra era</p>
        <MaskedWord masked={null} revealed={session.revealed_word} size="lg" />
      </div>
      {drawer && (
        <p className="text-sm" style={{ color: VS.mut }}>
          Desenhado por <span className="font-bold text-white">{drawer.display_name.split(' ')[0]}</span>
        </p>
      )}
      <div className="w-full max-w-xs space-y-1.5 rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
        {correct.length === 0 ? (
          <p className="text-sm" style={{ color: VS.mut }}>Ninguém acertou desta vez 😅</p>
        ) : (
          correct.map((g) => {
            const p = playerById.get(g.player_id)
            return (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span className={`font-semibold ${g.player_id === meId ? 'text-white' : 'text-white/80'}`}>
                  {p?.display_name.split(' ')[0] ?? '?'}
                </span>
                <span className="font-black tabular-nums" style={{ color: VS.teal }}>+{g.points}</span>
              </div>
            )
          })
        )}
      </div>
      <p className="text-xs" style={{ color: VS.mut }}>À espera da próxima ronda…</p>
    </div>
  )
}

// ── Pódio final ───────────────────────────────────────────────
export function PodiumView({ players, meId }: { players: VanaSketchPlayer[]; meId?: string }) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="text-center">
        <Trophy className="mx-auto h-12 w-12" style={{ color: VS.amber }} />
        <p className={`${vsHand.className} mt-2 text-4xl font-bold`}>Fim de jogo!</p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-2xl border p-3"
            style={{
              background: i === 0 ? 'rgba(255,179,71,.12)' : VS.panel,
              borderColor: i === 0 ? 'rgba(255,179,71,.45)' : VS.pline,
              boxShadow: p.id === meId ? `inset 0 0 0 1.5px ${VS.pink}` : undefined,
            }}
          >
            <span className="w-8 text-center text-xl font-black">{medals[i] ?? `${i + 1}º`}</span>
            <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={36} highlight={i === 0} />
            <span className="min-w-0 flex-1 truncate font-bold">{p.display_name}</span>
            <span className="font-black tabular-nums" style={{ color: VS.amber }}>{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
