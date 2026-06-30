'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
  proposeVanaWordsTeams,
  moveVanaWordsPlayer,
  confirmVanaWordsTeams,
  rerollArauto,
  confirmVanaWordsArautos,
  startVanaWordsGame,
  submitHint,
  confirmWord,
  passTurn,
  awardVanaWordsPoints,
  addVanaWordsBot,
  deleteVanaWordsSession,
} from '@/lib/actions/vana-words'
import { WordGrid } from './WordGrid'
import { TeamRoulette } from './TeamRoulette'
import { HostBotOverlay } from './HostBotOverlay'
import { TEAM_LABELS, TEAM_COLORS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'
import { Users, Crown, RefreshCw, Play, CheckCircle2, Trophy, ArrowRight, Shuffle, MonitorPlay, Bot, Trash2, Minus, Plus, Copy, Check, Maximize2, Eye, EyeOff } from 'lucide-react'

interface HostControlProps {
  session: VanaWordsSession
  initialPlayers: VanaWordsPlayer[]
  initialWords: VanaWordsWord[]
  hostProfile: { id: string; full_name: string }
}

export function HostControl({ session: initSession, initialPlayers, initialWords, hostProfile }: HostControlProps) {
  const [session, setSession] = useState(initSession)
  const [players, setPlayers] = useState(initialPlayers)
  const [words, setWords] = useState(initialWords)
  const [guesses, setGuesses] = useState<VanaWordsGuess[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rouletteADone, setRouletteADone] = useState(false)
  const [rouletteBDone, setRouletteBDone] = useState(false)
  const [hintInput, setHintInput] = useState('')
  const [hintNumber, setHintNumber] = useState(1)
  const [botName, setBotName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [boardHidden, setBoardHidden] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const fetchWords = useCallback(async () => {
    const { data } = await supabase.rpc('get_vanawords_with_teams', { p_session_id: session.id })
    if (data) setWords(data as VanaWordsWord[])
  }, [session.id])

  const fetchGuesses = useCallback(async () => {
    const { data } = await supabase.from('vanawords_guesses').select('*').eq('session_id', session.id)
    if (data) setGuesses(data as VanaWordsGuess[])
  }, [session.id])

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase.from('vanawords_players').select('*').eq('session_id', session.id)
    if (data) setPlayers(data as VanaWordsPlayer[])
  }, [session.id])

  const fetchSession = useCallback(async () => {
    const { data } = await supabase.from('vanawords_sessions').select('*').eq('id', session.id).maybeSingle()
    if (data) setSession((s) => ({ ...s, ...(data as VanaWordsSession) }))
  }, [session.id])

  useEffect(() => {
    fetchWords()
    fetchGuesses()

    const chan = supabase.channel(`vanawords-host-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_sessions', filter: `id=eq.${session.id}` },
        (payload) => { setSession((s) => ({ ...s, ...(payload.new as VanaWordsSession) })) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_players', filter: `session_id=eq.${session.id}` },
        () => { fetchPlayers() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanawords_guesses', filter: `session_id=eq.${session.id}` },
        () => { fetchGuesses() })
      .subscribe()

    // Reforço: sondagem periódica caso o realtime falhe (votos de bots/jogadores)
    const poll = setInterval(() => {
      fetchGuesses()
      fetchSession()
    }, 2500)

    return () => { supabase.removeChannel(chan); clearInterval(poll) }
  }, [session.id])

  // Re-fetch words whenever board_version changes
  useEffect(() => { fetchWords() }, [session.board_version])

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setLoading(true)
    setError(null)
    const res = await fn()
    if (res && 'error' in res && res.error) setError(res.error)
    // Atualiza imediatamente após a ação, sem depender só do realtime
    await Promise.all([fetchWords(), fetchGuesses(), fetchSession(), fetchPlayers()])
    setLoading(false)
  }

  const teamA = players.filter((p) => p.team === 'a')
  const teamB = players.filter((p) => p.team === 'b')
  const arautoA = players.find((p) => p.team === 'a' && p.is_arauto)
  const arautoB = players.find((p) => p.team === 'b' && p.is_arauto)
  const lobby = players.filter((p) => !p.team)

  const wordsA = words.filter((w) => w.team === 'a')
  const wordsB = words.filter((w) => w.team === 'b')
  const revealedA = wordsA.filter((w) => w.is_revealed).length
  const revealedB = wordsB.filter((w) => w.is_revealed).length

  const presentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/jogos/vana-words/${session.id}/present`
    : ''
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/jogos/vana-words?code=${session.code}`
    : ''

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // Canal de broadcast para comandar o projetor (ampliar QR Code)
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  useEffect(() => {
    const ch = supabase.channel(`vanawords-present-${session.id}`, { config: { broadcast: { self: false } } })
    ch.subscribe()
    broadcastRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [session.id])

  // Sincroniza o estado do zoom do QR com o projetor sempre que muda
  useEffect(() => {
    broadcastRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { qrZoomed } })
  }, [qrZoomed])

  // FAB de impersonação de bots — visível em todas as fases das sessões de teste
  const overlay = session.is_test_session
    ? <HostBotOverlay sessionId={session.id} players={players} />
    : null
  const wrap = (node: React.ReactNode) => <>{node}{overlay}</>

  // ── Lobby ──────────────────────────────────────────────────
  if (session.status === 'lobby') {
    const bots = players.filter((p) => p.is_bot)
    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-4">
        <div className="max-w-lg mx-auto space-y-6 pt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/images/VanaWords.png" alt="VanaWords" className="h-12 w-auto object-contain" />
              <p className="text-slate-400 text-sm">Painel do Host</p>
            </div>
            <a
              href={presentUrl}
              target="_blank"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition-colors"
            >
              <MonitorPlay className="w-4 h-4" /> Projetor
            </a>
          </div>

          <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700 text-center">
            <p className="text-slate-400 text-sm mb-2">Código de entrada</p>
            <p className="text-5xl font-black text-white tracking-widest">{session.code}</p>
            <p className="text-slate-500 text-xs mt-2">/jogos/vana-words</p>
          </div>

          {/* Copiar código */}
          <button
            onClick={copyCode}
            className={`w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.98] ${
              copied ? 'bg-emerald-500 text-white' : 'bg-slate-800/60 text-white border border-slate-700 hover:bg-slate-700/60'
            }`}
          >
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${copied ? 'bg-white/20' : 'bg-emerald-500/20'}`}>
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5 text-emerald-300" />}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-bold text-sm">{copied ? 'Link copiado!' : 'Copiar link de entrada'}</p>
              <p className={`text-xs truncate ${copied ? 'text-white/70' : 'text-slate-400'}`}>
                {copied ? 'Cola onde quiseres partilhar' : `Código já incluído · toca para copiar`}
              </p>
            </div>
          </button>

          {/* Ampliar QR Code no projetor */}
          <button
            onClick={() => setQrZoomed((v) => !v)}
            className={`w-full rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.98] ${
              qrZoomed ? 'bg-yellow-400 text-yellow-900' : 'bg-white text-gray-900'
            }`}
          >
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${qrZoomed ? 'bg-yellow-900/10' : 'bg-gray-100'}`}>
              <Maximize2 className={`w-5 h-5 ${qrZoomed ? 'text-yellow-900' : 'text-gray-700'}`} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm">
                {qrZoomed ? 'A mostrar QR Code grande' : 'Ampliar QR Code no projetor'}
              </p>
              <p className={`text-xs ${qrZoomed ? 'text-yellow-900/70' : 'text-gray-500'}`}>
                {qrZoomed ? 'Toca para fechar' : 'Toca para ampliar no ecrã grande'}
              </p>
            </div>
            {qrZoomed && <span className="w-2 h-2 bg-yellow-900 rounded-full animate-pulse" />}
          </button>

          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 font-semibold text-sm">{players.length} jogador(es)</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {players.length === 0 && (
                <p className="text-slate-500 text-sm">À espera de jogadores…</p>
              )}
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-white/80 animate-in fade-in slide-in-from-left-2 duration-300">
                  <span className={`w-2 h-2 rounded-full ${p.is_bot ? 'bg-purple-400' : 'bg-emerald-400'}`} />
                  <span className="flex-1">{p.display_name}</span>
                  {p.is_bot && <Bot className="w-3 h-3 text-purple-400" />}
                </div>
              ))}
            </div>
          </div>

          {session.is_test_session && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-purple-700/40">
              <p className="text-purple-300 text-xs font-bold mb-2 uppercase tracking-wider">Modo Teste — Adicionar Bot</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600"
                  placeholder="Nome do bot"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && botName.trim()) {
                      run(async () => {
                        const res = await addVanaWordsBot(session.id, botName.trim())
                        if (!res.error) setBotName('')
                        return res
                      })
                    }
                  }}
                />
                <button
                  onClick={() => run(async () => {
                    if (!botName.trim()) return
                    const res = await addVanaWordsBot(session.id, botName.trim())
                    if (!res.error) setBotName('')
                    return res
                  })}
                  className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1"
                >
                  <Bot className="w-4 h-4" /> Adicionar
                </button>
              </div>
              {bots.length > 0 && (
                <p className="text-purple-400/60 text-xs mt-2">
                  Usa o botão flutuante 🤖 (canto inferior direito) para jogar como cada bot
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={() => run(() => proposeVanaWordsTeams(session.id))}
            disabled={loading || players.length < 4}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:saturate-50 text-white font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition-all"
          >
            <Shuffle className="w-5 h-5" />
            {loading ? 'A atribuir…' : 'Atribuir Equipas'}
          </button>
          {players.length < 4 && (
            <p className="text-slate-400 text-xs text-center -mt-3">
              Mínimo de 4 jogadores · faltam {4 - players.length}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Team Preview ───────────────────────────────────────────
  if (session.status === 'team_preview') {
    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-4">
        <div className="max-w-2xl mx-auto space-y-6 pt-8">
          <div className="text-center">
            <h1 className="text-2xl font-black text-white">Pré-visualização das Equipas</h1>
            <p className="text-slate-400 text-sm mt-1">Clica num nome para mudar de equipa</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(['a', 'b'] as TeamId[]).map((tid) => {
              const team = tid === 'a' ? teamA : teamB
              const colors = TEAM_COLORS[tid]
              const label = TEAM_LABELS[tid]
              const icon = tid === 'a' ? '🦁' : '🦅'
              const otherTeam: TeamId = tid === 'a' ? 'b' : 'a'
              return (
                <div key={tid} className={`bg-slate-800/60 rounded-2xl p-4 border ${colors.border}`}>
                  <p className={`${colors.text} font-bold text-sm mb-3`}>{icon} Equipa {label}</p>
                  <div className="space-y-2">
                    {team.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => run(() => moveVanaWordsPlayer(session.id, p.id, otherTeam))}
                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors flex items-center gap-2"
                      >
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        {p.display_name}
                        {p.is_bot && <span className="text-[10px] text-purple-400 ml-auto">bot</span>}
                      </button>
                    ))}
                    {team.length === 0 && (
                      <p className="text-slate-500 text-sm">Vazia</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {lobby.length > 0 && (
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700">
              <p className="text-slate-400 text-xs mb-2">Sem equipa</p>
              {lobby.map((p) => <p key={p.id} className="text-white/60 text-sm">{p.display_name}</p>)}
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={() => run(() => confirmVanaWordsTeams(session.id))}
            disabled={loading || teamA.length === 0 || teamB.length === 0}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-lg flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            {loading ? 'A confirmar…' : 'Confirmar Equipas'}
          </button>
        </div>
      </div>
    )
  }

  // ── Arauto Spin ────────────────────────────────────────────
  if (session.status === 'arauto_spin') {
    const allDone = rouletteADone && rouletteBDone
    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white">A Escolher os Arautos</h1>
          <p className="text-slate-400 text-sm mt-1">A roleta está a decidir quem guiará cada equipa</p>
        </div>

        <div className="flex gap-8 flex-wrap justify-center">
          {arautoA && teamA.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <TeamRoulette
                key={`host-a-${arautoA.id}`}
                team="a"
                candidates={teamA}
                winner={arautoA}
                onDone={() => setRouletteADone(true)}
              />
              <button
                onClick={async () => {
                  if (loading || teamA.length < 2) return
                  setError(null)
                  setLoading(true)
                  setRouletteADone(false)
                  const res = await rerollArauto(session.id, 'a')
                  if (res?.error) { setError(res.error); setRouletteADone(true) }
                  setLoading(false)
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mt-1 disabled:opacity-40"
                disabled={loading || teamA.length < 2}
              >
                <RefreshCw className="w-3 h-3" /> Trocar
              </button>
            </div>
          )}
          {arautoB && teamB.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <TeamRoulette
                key={`host-b-${arautoB.id}`}
                team="b"
                candidates={teamB}
                winner={arautoB}
                onDone={() => setRouletteBDone(true)}
              />
              <button
                onClick={async () => {
                  if (loading || teamB.length < 2) return
                  setError(null)
                  setLoading(true)
                  setRouletteBDone(false)
                  const res = await rerollArauto(session.id, 'b')
                  if (res?.error) { setError(res.error); setRouletteBDone(true) }
                  setLoading(false)
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mt-1 disabled:opacity-40"
                disabled={loading || teamB.length < 2}
              >
                <RefreshCw className="w-3 h-3" /> Trocar
              </button>
            </div>
          )}
        </div>

        {allDone && (
          <div className="text-center space-y-4">
            <div className="flex gap-6 justify-center text-white">
              <div className="text-center">
                <p className="text-amber-400 text-xs font-bold mb-1">🦁 ARAUTO LEÃO</p>
                <p className="font-bold">{arautoA?.display_name}</p>
              </div>
              <div className="text-center">
                <p className="text-blue-400 text-xs font-bold mb-1">🦅 ARAUTO ÁGUIA</p>
                <p className="font-bold">{arautoB?.display_name}</p>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={() => run(() => confirmVanaWordsArautos(session.id))}
              disabled={loading}
              className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-lg transition-colors"
            >
              {loading ? 'A confirmar…' : 'Confirmar Arautos'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Arauto Ready ───────────────────────────────────────────
  if (session.status === 'arauto_ready') {
    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black text-white">Arautos Prontos?</h1>
          <p className="text-slate-400 text-sm">Os Arautos devem ir para o ecrã grande e abrir a vista de Arauto nos seus dispositivos.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 w-full max-w-sm">
          <div className="bg-slate-800/60 rounded-2xl p-5 border border-amber-500/40 text-center">
            <p className="text-amber-400 text-xs font-bold mb-2">🦁 Leão</p>
            <p className="text-white font-bold">{arautoA?.display_name ?? '—'}</p>
            <p className="text-slate-400 text-xs mt-1">Arauto</p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-5 border border-blue-500/40 text-center">
            <p className="text-blue-400 text-xs font-bold mb-2">🦅 Águia</p>
            <p className="text-white font-bold">{arautoB?.display_name ?? '—'}</p>
            <p className="text-slate-400 text-xs mt-1">Arauto</p>
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700 text-sm text-slate-300 text-center max-w-sm">
          <p className="font-bold text-white mb-1">Vista do Arauto</p>
          <p className="text-slate-400 text-xs">/jogos/vana-words/{session.id}/arauto</p>
        </div>

        <div className="hidden sm:flex gap-3">
          <a
            href={presentUrl}
            target="_blank"
            className="px-5 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold flex items-center gap-2 text-sm"
          >
            <MonitorPlay className="w-4 h-4" /> Abrir Projetor
          </a>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={() => run(() => startVanaWordsGame(session.id))}
          disabled={loading}
          className="px-10 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-white font-bold text-lg flex items-center gap-2 shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition-all"
        >
          <Play className="w-5 h-5" />
          {loading ? 'A iniciar…' : 'Os Arautos estão prontos — Começar!'}
        </button>
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────
  if (session.status === 'playing') {
    const activeTeam = session.current_team as TeamId
    const colors = TEAM_COLORS[activeTeam]
    const label = TEAM_LABELS[activeTeam]
    const icon = activeTeam === 'a' ? '🦁' : '🦅'
    const isHinting = session.current_phase === 'hinting'

    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 p-3">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/images/VanaWords.png" alt="VanaWords" className="h-9 w-auto object-contain" />
              <span className="text-slate-400 font-normal text-sm">Host</span>
            </div>
            <a href={presentUrl} target="_blank"
              className="hidden sm:flex text-xs text-slate-400 hover:text-white items-center gap-1">
              <MonitorPlay className="w-3 h-3" /> Projetor
            </a>
          </div>

          {/* Marcador */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`bg-slate-800/60 rounded-xl p-3 border ${activeTeam === 'a' ? 'border-amber-500' : 'border-slate-700'}`}>
              <p className="text-amber-400 text-xs font-bold">🦁 Leão</p>
              <p className="text-white font-bold text-xl">{revealedA} / {wordsA.length}</p>
            </div>
            <div className={`bg-slate-800/60 rounded-xl p-3 border ${activeTeam === 'b' ? 'border-blue-500' : 'border-slate-700'}`}>
              <p className="text-blue-400 text-xs font-bold">🦅 Águia</p>
              <p className="text-white font-bold text-xl">{revealedB} / {wordsB.length}</p>
            </div>
          </div>

          {/* Estado do turno */}
          <div className={`rounded-xl p-3 border ${colors.badge}`}>
            <div className="flex items-center justify-between">
              <p className={`font-bold ${colors.text}`}>{icon} Equipa {label}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
                {isHinting ? 'A dar dica' : `${session.guesses_remaining} tentativa(s) restante(s)`}
              </span>
            </div>
            {session.current_hint && (
              <p className="text-white mt-1 text-lg font-black">
                «{session.current_hint}» — {session.current_hint_number}
              </p>
            )}
          </div>

          {/* Dica (fase hinting, host pode submeter em vez do arauto) */}
          {isHinting && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700 space-y-3">
              <p className="text-slate-300 text-sm font-semibold">Submeter dica (Arauto ou Host)</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 uppercase"
                  placeholder="Palavra-dica"
                  value={hintInput}
                  onChange={(e) => setHintInput(e.target.value)}
                />
                <div className="flex shrink-0 items-stretch rounded-lg border border-slate-600 bg-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setHintNumber((n) => Math.max(1, n - 1))}
                    disabled={hintNumber <= 1}
                    aria-label="Diminuir"
                    className="px-2.5 flex items-center text-white hover:bg-slate-600 disabled:opacity-30 active:bg-slate-500"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-7 flex items-center justify-center text-sm font-black text-white tabular-nums select-none">
                    {hintNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHintNumber((n) => Math.min(5, n + 1))}
                    disabled={hintNumber >= 5}
                    aria-label="Aumentar"
                    className="px-2.5 flex items-center text-white hover:bg-slate-600 disabled:opacity-30 active:bg-slate-500"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => run(async () => {
                    if (!hintInput.trim()) return
                    const res = await submitHint(session.id, hintInput.trim(), hintNumber)
                    if (!res.error) setHintInput('')
                    return res
                  })}
                  disabled={loading || !hintInput.trim()}
                  className={`px-4 py-2 shrink-0 rounded-lg font-bold text-sm text-white transition-colors disabled:opacity-40 ${colors.bg}`}
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {/* Esconder/mostrar a grelha (privacidade ao aproximar-se de não-arautos) */}
          <button
            onClick={() => setBoardHidden((v) => !v)}
            className={`w-full rounded-xl p-3 flex items-center justify-center gap-2 text-sm font-semibold transition-colors ${
              boardHidden ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
          >
            {boardHidden ? <><Eye className="w-4 h-4" /> Mostrar quadro</> : <><EyeOff className="w-4 h-4" /> Esconder quadro</>}
          </button>

          {/* Grelha de palavras */}
          {boardHidden ? (
            <button
              onClick={() => setBoardHidden(false)}
              className="w-full rounded-xl border border-dashed border-slate-600 bg-slate-800/40 py-16 flex flex-col items-center justify-center gap-2 text-slate-400 hover:bg-slate-800/60 transition-colors"
            >
              <EyeOff className="w-8 h-8" />
              <p className="font-semibold text-sm">Quadro escondido</p>
              <p className="text-xs">Toca para voltar a mostrar</p>
            </button>
          ) : (
            <WordGrid
              words={words}
              guesses={guesses}
              players={players}
              showColors={true}
              onWordClick={!isHinting ? (wordId) => run(() => confirmWord(session.id, wordId)) : undefined}
              disabled={isHinting}
            />
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Passar turno */}
          {!isHinting && (
            <button
              onClick={() => run(() => passTurn(session.id))}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" /> Passar turno à outra equipa
            </button>
          )}

          <p className="text-slate-500 text-xs text-center">
            {isHinting
              ? 'Insere a dica acima para a equipa começar a adivinhar'
              : 'Clica numa palavra para a revelar'}
          </p>
        </div>
      </div>
    )
  }

  // ── Finished ───────────────────────────────────────────────
  if (session.status === 'finished') {
    const winner = session.winner_team as TeamId | null
    const label = winner ? TEAM_LABELS[winner] : null
    const icon = winner === 'a' ? '🦁' : winner === 'b' ? '🦅' : '🏆'
    const colors = winner ? TEAM_COLORS[winner] : null

    return wrap(
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <p className="text-6xl mb-3">{icon}</p>
          <h1 className="text-3xl font-black text-white">
            {winner ? `Equipa ${label} venceu!` : 'Jogo terminado!'}
          </h1>
          {session.win_reason === 'black_hit' && (
            <p className="text-red-400 text-sm mt-1">A palavra preta foi revelada! 💀</p>
          )}
          {session.win_reason === 'all_found' && (
            <p className={`${colors?.text} text-sm mt-1`}>Todas as palavras da equipa foram encontradas!</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(['a', 'b'] as TeamId[]).map((tid) => (
            <div key={tid} className={`bg-slate-800/60 rounded-2xl p-4 border ${tid === winner ? TEAM_COLORS[tid].border : 'border-slate-700'} text-center`}>
              <p className={`font-bold ${TEAM_COLORS[tid].text} mb-2`}>{tid === 'a' ? '🦁' : '🦅'} {TEAM_LABELS[tid]}</p>
              {players.filter((p) => p.team === tid).map((p) => (
                <p key={p.id} className="text-white/80 text-sm">{p.display_name}</p>
              ))}
            </div>
          ))}
        </div>

        <WordGrid words={words} guesses={[]} players={players} showColors={true} disabled />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!session.rewards_awarded && winner && (
          <button
            onClick={() => run(() => awardVanaWordsPoints(session.id))}
            disabled={loading}
            className="px-8 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg flex items-center gap-2 transition-colors"
          >
            <Trophy className="w-5 h-5" />
            {loading ? 'A atribuir…' : 'Atribuir 100 XP e 50 Gold à Equipa Vencedora'}
          </button>
        )}

        {session.rewards_awarded && (
          <p className="text-emerald-400 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> XP e Gold atribuídos!
          </p>
        )}

        {/* Apagar a sessão depois de terminada */}
        {!confirmDelete ? (
          <button
            onClick={() => { setConfirmDelete(true); setError(null) }}
            className="mt-2 flex items-center gap-1.5 text-slate-500 hover:text-red-400 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Apagar sessão
          </button>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-center space-y-3">
            <p className="text-sm text-slate-200">Apagar a sessão <span className="font-black">{session.code}</span>? Esta ação é permanente.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={loading}
                className="flex-1 rounded-xl bg-slate-700 hover:bg-slate-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => run(async () => {
                  const res = await deleteVanaWordsSession(session.id)
                  if (!res.error) router.push('/admin/vana-words')
                  return res
                })}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" /> {loading ? 'A apagar…' : 'Apagar'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
