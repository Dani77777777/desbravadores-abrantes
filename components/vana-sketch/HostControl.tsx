'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import {
  startVanaSketchGame,
  chooseSketchWord,
  endSketchRound,
  nextSketchRound,
  awardVanaSketchPoints,
  deleteVanaSketchSession,
  addVanaSketchBot,
} from '@/lib/actions/vana-sketch'
import type { VanaSketchSession, VanaSketchPlayer, VanaSketchGuess } from '@/types/vana-sketch'
import { useSketchSession, useSketchPlayers, useSketchGuesses } from './useSketchSession'
import { CanvasViewer } from './CanvasViewer'
import { HostBotOverlay } from './HostBotOverlay'
import { SketchAvatar, CountdownBadge, useCountdown } from './ui'
import { VS, VS_SCREEN_STYLE, vsHand, vsSans } from './theme'
import {
  Play, MonitorPlay, SkipForward, ArrowRight, Trophy, Trash2, Dices, Eye, Users, Flag,
  Copy, Check, Maximize2, Bot, Plus, Volume2, VolumeX,
} from 'lucide-react'

interface HostControlProps {
  session: VanaSketchSession
  initialPlayers: VanaSketchPlayer[]
}

export function HostControl({ session: initialSession, initialPlayers }: HostControlProps) {
  const [session, setSession] = useState<VanaSketchSession>(initialSession)
  const [players, setPlayers] = useState<VanaSketchPlayer[]>(initialPlayers)
  const [guesses, setGuesses] = useState<VanaSketchGuess[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useSketchSession(session.id, (row) => setSession(row as VanaSketchSession))
  useSketchPlayers(session.id, (rows) => setPlayers(rows as VanaSketchPlayer[]))
  useSketchGuesses(session.id, session.round_number, (rows) => setGuesses(rows as VanaSketchGuess[]))

  const drawer = players.find((p) => p.id === session.drawer_player_id)
  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players])

  // Definições do jogo (lobby)
  const [roundsPerPlayer, setRoundsPerPlayer] = useState(1)
  const [drawSeconds, setDrawSeconds] = useState(90)

  // Bots (sessões de teste)
  const [botName, setBotName] = useState('')
  const [addingBot, setAddingBot] = useState(false)
  async function addBot() {
    setAddingBot(true)
    setError(null)
    // Sem nome escrito → gera "Bot N"
    const existing = players.filter((p) => p.is_bot).length
    const name = botName.trim() || `Bot ${existing + 1}`
    const res = await addVanaSketchBot(session.id, name)
    if (res.error) setError(res.error)
    else setBotName('')
    setAddingBot(false)
  }

  // Link de entrada (código já incluído) + cópia
  const [copied, setCopied] = useState(false)
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/jogos/vana-sketch?code=${session.code}`
    : ''
  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // Canal de broadcast para comandar o projetor (ampliar QR Code, música)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const presentChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`vanasketch-present-${session.id}`, { config: { broadcast: { self: false } } })
    ch.subscribe()
    presentChannelRef.current = ch
    return () => { presentChannelRef.current = null; supabase.removeChannel(ch) }
  }, [session.id])

  // Sincroniza o zoom do QR e a música com o projetor sempre que mudam
  useEffect(() => {
    presentChannelRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { qrZoomed, musicEnabled } })
  }, [qrZoomed, musicEnabled])

  // Palavra secreta visível ao host
  const [secretWord, setSecretWord] = useState<string | null>(null)
  useEffect(() => {
    setSecretWord(null)
    if (session.status !== 'playing' || session.phase === 'round_end') return
    let cancelled = false
    const supabase = createClient()
    const load = async () => {
      const { data } = await supabase.rpc('get_vanasketch_drawer_info', { p_session_id: session.id })
      if (!cancelled && data && data.length > 0) setSecretWord(data[0].word)
    }
    load()
    const t = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(t) }
  }, [session.id, session.round_number, session.phase, session.status])

  // Watchdog do relógio: quando o tempo acaba, o host fecha a ronda
  const timeoutFiredRef = useRef<string | null>(null)
  const left = useCountdown(session.round_ends_at)
  useEffect(() => {
    if (session.status !== 'playing' || session.phase !== 'drawing') return
    if (left !== 0 || !session.round_ends_at) return
    const key = `${session.round_number}`
    if (timeoutFiredRef.current === key) return
    timeoutFiredRef.current = key
    endSketchRound(session.id, 'timeout').then((res) => {
      // Se o servidor recusar (ex.: relógio do host adiantado), tenta de novo
      if (res?.error) {
        setTimeout(() => {
          if (timeoutFiredRef.current === key) timeoutFiredRef.current = null
        }, 2000)
      }
    })
  }, [left, session])

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setBusy(true)
    setError(null)
    const res = await fn()
    if (res && 'error' in res && res.error) setError(res.error)
    setBusy(false)
  }

  const correctCount = guesses.filter((g) => g.is_correct).length

  return (
    <div className={`min-h-screen ${vsSans.className}`} style={VS_SCREEN_STYLE}>
      {/* FAB de impersonação de bots — visível em todas as fases das sessões de teste */}
      {session.is_test_session && (
        <HostBotOverlay
          sessionId={session.id}
          players={players}
          drawerPlayerId={session.drawer_player_id}
        />
      )}
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-4">
        {/* Cabeçalho */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/images/VanaSketch.png" alt="VanaSketch" className="h-10 w-10 object-contain" />
            <div>
              <p className={`${vsHand.className} text-2xl font-bold leading-none`}>VanaSketch — Controlo</p>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: VS.mut }}>
                Código <span className="font-mono text-white">{session.code}</span>
                {session.status === 'playing' && ` · Ronda ${session.round_number}/${session.total_rounds}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMusicEnabled((v) => !v)}
              title={musicEnabled ? 'Música do projetor ligada (clica para desligar)' : 'Música do projetor desligada (clica para ligar)'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-white/10"
              style={{ borderColor: VS.pline, color: musicEnabled ? VS.amber : VS.mut }}
            >
              {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <Link
              href={`/jogos/vana-sketch/${session.id}/present`}
              target="_blank"
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold hover:bg-white/10"
              style={{ borderColor: VS.pline }}
            >
              <MonitorPlay className="h-4 w-4" style={{ color: VS.amber }} /> Projetor
            </Link>
          </div>
        </header>

        {error && (
          <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
            {error}
          </p>
        )}

        {/* ── Lobby ─────────────────────────────────────────── */}
        {session.status === 'lobby' && (
          <>
            <section className="rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
              <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>
                <Users className="h-3.5 w-3.5" /> Jogadores ({players.length})
              </p>
              {players.length === 0 ? (
                <p className="text-sm" style={{ color: VS.mut }}>
                  Partilha o código <span className="font-mono font-black text-white">{session.code}</span> — os jogadores entram em Jogos → VanaSketch.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3">
                      <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={26} />
                      <span className="text-xs font-semibold">
                        {p.is_bot && '🤖 '}{p.display_name.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar bots (só sessões de teste) */}
              {session.is_test_session && (
                <div className="mt-4 space-y-2 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
                    <Bot className="h-3.5 w-3.5" /> Sessão de teste — adicionar bots
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-purple-500/30 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-purple-400 focus:outline-none"
                      placeholder="Nome do bot (opcional)"
                      value={botName}
                      maxLength={30}
                      onChange={(e) => setBotName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBot() } }}
                    />
                    <button
                      type="button"
                      disabled={addingBot}
                      onClick={addBot}
                      className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> Bot
                    </button>
                  </div>
                  <p className="text-[11px] text-purple-300/70">
                    Jogadores reais também podem entrar com o código. Durante o jogo, usa o painel roxo (canto inferior esquerdo) para jogar como cada bot.
                  </p>
                </div>
              )}
            </section>

            {/* Copiar link de entrada */}
            <button
              type="button"
              onClick={copyJoinLink}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 transition-all active:scale-[0.98] ${
                copied ? 'border-emerald-400/60 bg-emerald-500/20' : 'hover:bg-white/10'
              }`}
              style={!copied ? { background: VS.panel, borderColor: VS.pline } : undefined}
            >
              <div className={`shrink-0 rounded-xl p-2.5 ${copied ? 'bg-emerald-400/20' : 'bg-pink-500/15'}`}>
                {copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5" style={{ color: VS.pink }} />}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold">{copied ? 'Link copiado!' : 'Copiar link de entrada'}</p>
                <p className="truncate text-xs" style={{ color: copied ? 'rgba(255,255,255,.7)' : VS.mut }}>
                  {copied ? 'Cola onde quiseres partilhar' : 'Código já incluído · toca para copiar'}
                </p>
              </div>
            </button>

            {/* Ampliar QR Code no projetor */}
            <button
              type="button"
              onClick={() => setQrZoomed((v) => !v)}
              className={`flex w-full items-center gap-3 rounded-2xl p-4 transition-all active:scale-[0.98] ${
                qrZoomed ? 'bg-yellow-400 text-yellow-900' : 'bg-white text-gray-900'
              }`}
            >
              <div className={`shrink-0 rounded-xl p-2.5 ${qrZoomed ? 'bg-yellow-900/10' : 'bg-gray-100'}`}>
                <Maximize2 className={`h-5 w-5 ${qrZoomed ? 'text-yellow-900' : 'text-gray-700'}`} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold">
                  {qrZoomed ? 'A mostrar QR Code grande' : 'Ampliar QR Code no projetor'}
                </p>
                <p className={`text-xs ${qrZoomed ? 'text-yellow-900/70' : 'text-gray-500'}`}>
                  {qrZoomed ? 'Toca para fechar' : 'Toca para ampliar no ecrã grande'}
                </p>
              </div>
              {qrZoomed && <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-900" />}
            </button>

            <section className="space-y-4 rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>Voltas (cada um desenha…)</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRoundsPerPlayer(n)}
                      className="flex-1 rounded-xl border py-2.5 font-bold transition-colors"
                      style={{
                        borderColor: roundsPerPlayer === n ? VS.pink : VS.pline,
                        background: roundsPerPlayer === n ? 'rgba(255,93,162,.15)' : 'transparent',
                      }}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut }}>Tempo para desenhar</p>
                <div className="flex gap-2">
                  {[60, 90, 120].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDrawSeconds(s)}
                      className="flex-1 rounded-xl border py-2.5 font-bold transition-colors"
                      style={{
                        borderColor: drawSeconds === s ? VS.pink : VS.pline,
                        background: drawSeconds === s ? 'rgba(255,93,162,.15)' : 'transparent',
                      }}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
              {players.length > 0 && (
                <p className="text-xs" style={{ color: VS.mut }}>
                  {players.length} jogador{players.length !== 1 ? 'es' : ''} × {roundsPerPlayer} = {players.length * roundsPerPlayer} ronda{players.length * roundsPerPlayer !== 1 ? 's' : ''}
                  {' '}(~{Math.round((players.length * roundsPerPlayer * (drawSeconds + 25)) / 60)} min)
                </p>
              )}
            </section>

            <button
              type="button"
              disabled={busy || players.length < 2}
              onClick={() => run(() => startVanaSketchGame(session.id, { roundsPerPlayer, drawSeconds }))}
              className="flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-black text-white shadow-lg disabled:opacity-40"
              style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
            >
              <Play className="h-5 w-5" /> Começar o Jogo
            </button>
            {players.length < 2 && (
              <p className="text-center text-xs" style={{ color: VS.mut }}>São precisos pelo menos 2 jogadores.</p>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => {
                const res = await deleteVanaSketchSession(session.id)
                if (!res.error) router.push('/admin/vana-sketch')
                return res
              })}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-400/30 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" /> Apagar sessão
            </button>
          </>
        )}

        {/* ── A decorrer ────────────────────────────────────── */}
        {session.status === 'playing' && (
          <>
            <section className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ background: VS.panel, borderColor: VS.pline }}>
              <div className="flex items-center gap-3">
                {drawer && <SketchAvatar name={drawer.display_name} avatarUrl={drawer.avatar_url} size={40} highlight />}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: VS.mut }}>A desenhar</p>
                  <p className="font-bold leading-tight">{drawer?.display_name ?? '…'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl border px-3 py-1.5 text-right" style={{ borderColor: VS.pline }}>
                  <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: VS.mut }}>
                    <Eye className="h-3 w-3" /> Palavra
                  </p>
                  <p className={`${vsHand.className} text-2xl font-bold leading-none`} style={{ color: VS.pink }}>
                    {session.phase === 'round_end' ? session.revealed_word : secretWord ?? '…'}
                  </p>
                </div>
                {session.phase === 'drawing' && <CountdownBadge endsAt={session.round_ends_at} />}
              </div>
            </section>

            {session.phase === 'choosing' && (
              <section className="space-y-3 rounded-2xl border p-4 text-center" style={{ background: VS.panel, borderColor: VS.pline }}>
                <p style={{ color: VS.mut }}>
                  {drawer?.display_name.split(' ')[0] ?? 'O desenhador'} está a escolher a palavra…
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => chooseSketchWord(session.id, -1))}
                  className="mx-auto flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold hover:bg-white/10"
                  style={{ borderColor: VS.pline }}
                >
                  <Dices className="h-4 w-4" style={{ color: VS.amber }} /> Escolher aleatória (se demorar)
                </button>
              </section>
            )}

            {(session.phase === 'drawing' || session.phase === 'round_end') && (
              <CanvasViewer
                sessionId={session.id}
                roundNumber={session.round_number}
                canvasVersion={session.canvas_version}
                className="rounded-2xl border-4 border-white/20 shadow-2xl"
              />
            )}

            {session.phase === 'drawing' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold" style={{ color: VS.mut }}>
                  {correctCount} de {Math.max(0, players.length - 1)} acertaram
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => endSketchRound(session.id, 'skipped'))}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-white/10"
                  style={{ borderColor: VS.pline }}
                >
                  <SkipForward className="h-4 w-4" /> Terminar ronda já
                </button>
              </div>
            )}

            {session.phase === 'round_end' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => nextSketchRound(session.id))}
                className="flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-black text-white shadow-lg disabled:opacity-40"
                style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
              >
                {session.round_number >= session.total_rounds ? (
                  <><Flag className="h-5 w-5" /> Terminar o Jogo</>
                ) : (
                  <><ArrowRight className="h-5 w-5" /> Próxima Ronda ({session.round_number + 1}/{session.total_rounds})</>
                )}
              </button>
            )}

            {/* Placar compacto */}
            <section className="rounded-2xl border" style={{ background: VS.panel, borderColor: VS.pline }}>
              <p className="border-b px-4 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: VS.mut, borderColor: VS.pline }}>Placar</p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto p-2">
                {sorted.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
                    <span className="w-5 text-center font-black" style={{ color: VS.mut }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.display_name}</span>
                    <span className="font-black tabular-nums" style={{ color: VS.amber }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── Terminado ─────────────────────────────────────── */}
        {session.status === 'finished' && (
          <>
            <section className="rounded-2xl border p-4" style={{ background: VS.panel, borderColor: VS.pline }}>
              <p className="mb-3 flex items-center gap-2 text-lg font-black">
                <Trophy className="h-5 w-5" style={{ color: VS.amber }} /> Resultado final
              </p>
              <div className="space-y-1.5">
                {sorted.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-7 text-center text-lg">{['🥇', '🥈', '🥉'][i] ?? `${i + 1}º`}</span>
                    <SketchAvatar name={p.display_name} avatarUrl={p.avatar_url} size={28} />
                    <span className="min-w-0 flex-1 truncate font-bold">{p.display_name}</span>
                    <span className="font-black tabular-nums" style={{ color: VS.amber }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </section>

            {!session.rewards_awarded ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => {
                  const res = await awardVanaSketchPoints(session.id)
                  if (!res.error) setSession((s) => ({ ...s, rewards_awarded: true }))
                  return res
                })}
                className="flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-black text-white shadow-lg disabled:opacity-40"
                style={{ background: 'linear-gradient(160deg,#ffc65b,#f0951b)' }}
              >
                <Trophy className="h-5 w-5" /> Atribuir XP e Gold
              </button>
            ) : (
              <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-300">
                ✓ Recompensas atribuídas
              </p>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => {
                const res = await deleteVanaSketchSession(session.id)
                if (!res.error) router.push('/admin/vana-sketch')
                return res
              })}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-400/30 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" /> Apagar sessão
            </button>
          </>
        )}
      </div>
    </div>
  )
}
