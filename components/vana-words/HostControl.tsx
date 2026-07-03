'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
  proposeVanaWordsTeams,
  moveVanaWordsPlayer,
  respondVanaWordsSwap,
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
import { TeamChip } from './ui'
import { VW, VW_SCREEN_STYLE, VW_PANEL_STYLE, TEAM_GRADIENT, teamPanelStyle, vwSans, vwSerif } from './theme'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord, VanaWordsGuess, TeamId } from '@/types/vana-words'
import { Users, Crown, RefreshCw, Play, CheckCircle2, Trophy, ArrowRight, Shuffle, MonitorPlay, Bot, Trash2, Minus, Plus, Copy, Check, Maximize2, Eye, EyeOff, X, Repeat, Volume2, VolumeX } from 'lucide-react'

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
  const [arautoPicker, setArautoPicker] = useState<TeamId | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

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

  async function handleConfirmWord(wordId: string) {
    setError(null)
    // Feedback imediato: a palavra fica cinzenta já, sem esperar pelo servidor
    setWords((ws) => ws.map((w) => (w.id === wordId ? { ...w, is_revealed: true } : w)))
    setLoading(true)
    const res = await confirmWord(session.id, wordId)
    if (res?.error) setError(res.error)
    // Reconcilia com o servidor (marcador, turno, etc.)
    await Promise.all([fetchWords(), fetchGuesses(), fetchSession(), fetchPlayers()])
    setLoading(false)
  }

  const teamA = players.filter((p) => p.team === 'a')
  const teamB = players.filter((p) => p.team === 'b')
  const arautoA = players.find((p) => p.team === 'a' && p.is_arauto)
  const arautoB = players.find((p) => p.team === 'b' && p.is_arauto)
  const lobby = players.filter((p) => !p.team)

  async function doReroll(team: TeamId, opts?: { playerId?: string; instant?: boolean }) {
    setError(null)
    setLoading(true)
    if (team === 'a') setRouletteADone(false); else setRouletteBDone(false)
    const res = await rerollArauto(session.id, team, opts)
    if (res?.error) {
      setError(res.error)
      if (team === 'a') setRouletteADone(true); else setRouletteBDone(true)
    }
    setArautoPicker(null)
    await fetchPlayers()
    setLoading(false)
  }

  function renderArautoResponseBadge(arauto: VanaWordsPlayer | undefined) {
    if (!arauto) return null
    if (arauto.arauto_response === 'accepted') {
      return <p className="text-emerald-400 text-[11px] font-semibold">✅ Aceitou</p>
    }
    if (arauto.arauto_response === 'declined') {
      return <p className="text-red-400 text-[11px] font-semibold">❌ Prefere não ser — gira outra vez?</p>
    }
    return <p className="text-slate-500 text-[11px]">⏳ A aguardar resposta</p>
  }

  function renderArautoPicker(tid: TeamId) {
    const team = tid === 'a' ? teamA : teamB
    const current = tid === 'a' ? arautoA : arautoB
    const candidates = team.filter((p) => p.id !== current?.id)
    return (
      <div className="w-full max-w-[220px] bg-slate-900 border border-slate-600 rounded-xl p-3 space-y-2 text-left">
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Escolher Arauto</p>
        {candidates.length === 0 && <p className="text-slate-500 text-xs">Sem outros candidatos</p>}
        {candidates.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <span className="text-white text-sm truncate">{p.display_name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => doReroll(tid, { playerId: p.id, instant: false })}
                disabled={loading}
                title="Girar a roleta até parar nesta pessoa"
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs disabled:opacity-40"
              >
                🎰
              </button>
              <button
                onClick={() => doReroll(tid, { playerId: p.id, instant: true })}
                disabled={loading}
                title="Definir já, sem animação"
                className="px-2 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs disabled:opacity-40"
              >
                ⚡
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setArautoPicker(null)}
          className="text-slate-500 hover:text-slate-300 text-xs w-full text-center pt-1"
        >
          Fechar
        </button>
      </div>
    )
  }

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

  // Sincroniza música ligada/desligada com o projetor (os SFX tocam sempre)
  useEffect(() => {
    broadcastRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { musicEnabled } })
  }, [musicEnabled])

  // FAB de impersonação de bots — visível em todas as fases das sessões de teste
  const overlay = session.is_test_session
    ? <HostBotOverlay sessionId={session.id} players={players} />
    : null
  // Toggle da música do projetor — visível em todas as fases
  const musicToggle = (
    <button
      onClick={() => setMusicEnabled((v) => !v)}
      title={musicEnabled ? 'Música do projetor ligada (clica para desligar)' : 'Música do projetor desligada (clica para ligar)'}
      className={`fixed top-4 right-4 z-50 rounded-full p-3.5 shadow-lg transition-colors ${
        musicEnabled
          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300 shadow-black/40'
      }`}
    >
      {musicEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
    </button>
  )
  const wrap = (node: React.ReactNode) => <>{node}{overlay}{musicToggle}</>

  // ── Lobby ──────────────────────────────────────────────────
  if (session.status === 'lobby') {
    const bots = players.filter((p) => p.is_bot)
    return wrap(
      <div className={`min-h-screen ${vwSans.className} p-4`} style={VW_SCREEN_STYLE}>
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
            <p className={`${vwSerif.className} text-5xl font-semibold tracking-widest`}>{session.code}</p>
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
    const swapRequests = players.filter((p) => p.swap_requested)
    return wrap(
      <div className={`min-h-screen ${vwSans.className} p-4`} style={VW_SCREEN_STYLE}>
        <div className="max-w-2xl mx-auto space-y-6 pt-8">
          <div className="text-center">
            <h1 className={`${vwSerif.className} text-2xl font-semibold`}>Pré-visualização das Equipas</h1>
            <p className="text-sm mt-1" style={{ color: VW.mut }}>Clica num nome para mudar de equipa</p>
          </div>

          {swapRequests.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-2xl p-4 space-y-2">
              <p className="text-yellow-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" /> Pedidos de troca de equipa
              </p>
              {swapRequests.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-slate-800/60 rounded-xl px-3 py-2">
                  <span className="text-white text-sm font-semibold">
                    {p.display_name} <span className="text-slate-400 font-normal">— Equipa {p.team ? TEAM_LABELS[p.team] : '?'}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => run(() => respondVanaWordsSwap(session.id, p.id, true))}
                      disabled={loading}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Aceitar
                    </button>
                    <button
                      onClick={() => run(() => respondVanaWordsSwap(session.id, p.id, false))}
                      disabled={loading}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {(['a', 'b'] as TeamId[]).map((tid) => {
              const team = tid === 'a' ? teamA : teamB
              const label = TEAM_LABELS[tid]
              const otherTeam: TeamId = tid === 'a' ? 'b' : 'a'
              return (
                <div key={tid} className="rounded-2xl p-4 border" style={teamPanelStyle(tid)}>
                  <p className="font-bold text-sm mb-3"><TeamChip team={tid} label={`Equipa ${label}`} /></p>
                  <div className="space-y-2">
                    {team.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => run(() => moveVanaWordsPlayer(session.id, p.id, otherTeam))}
                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors flex items-center gap-2"
                      >
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        {p.display_name}
                        {p.swap_requested && <span title="Pediu para trocar de equipa">🔁</span>}
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
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-8`} style={VW_SCREEN_STYLE}>
        <div className="text-center">
          <h1 className={`${vwSerif.className} text-2xl font-semibold`}>A Escolher os Arautos</h1>
          <p className="text-sm mt-1" style={{ color: VW.mut }}>A roleta está a decidir quem guiará cada equipa</p>
        </div>

        <div className="flex gap-8 flex-wrap justify-center items-start">
          {arautoA && teamA.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <TeamRoulette
                key={`host-a-${arautoA.id}`}
                team="a"
                candidates={teamA}
                winner={arautoA}
                onDone={() => setRouletteADone(true)}
                instant={session.arauto_reveal_a === 'instant'}
              />
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={() => doReroll('a')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-40"
                  disabled={loading || teamA.length < 2}
                >
                  <RefreshCw className="w-3 h-3" /> Aleatório
                </button>
                <button
                  onClick={() => setArautoPicker(arautoPicker === 'a' ? null : 'a')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-40"
                  disabled={loading || teamA.length < 2}
                >
                  <Users className="w-3 h-3" /> Escolher
                </button>
              </div>
              {renderArautoResponseBadge(arautoA)}
              {arautoPicker === 'a' && renderArautoPicker('a')}
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
                instant={session.arauto_reveal_b === 'instant'}
              />
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={() => doReroll('b')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-40"
                  disabled={loading || teamB.length < 2}
                >
                  <RefreshCw className="w-3 h-3" /> Aleatório
                </button>
                <button
                  onClick={() => setArautoPicker(arautoPicker === 'b' ? null : 'b')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 disabled:opacity-40"
                  disabled={loading || teamB.length < 2}
                >
                  <Users className="w-3 h-3" /> Escolher
                </button>
              </div>
              {renderArautoResponseBadge(arautoB)}
              {arautoPicker === 'b' && renderArautoPicker('b')}
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
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        <div className="text-center space-y-2">
          <h1 className={`${vwSerif.className} text-2xl font-semibold`}>Arautos Prontos?</h1>
          <p className="text-sm" style={{ color: VW.mut }}>Os Arautos devem ir para o ecrã grande e abrir a vista de Arauto nos seus dispositivos.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 w-full max-w-sm">
          {([['a', arautoA, 'border-amber-500/40', 'text-amber-400', '🦁 Leão'], ['b', arautoB, 'border-blue-500/40', 'text-blue-400', '🦅 Águia']] as const).map(
            ([tid, arauto, border, text, label]) => (
              <div key={tid} className={`bg-slate-800/60 rounded-2xl p-5 border ${border} text-center space-y-1.5`}>
                <p className={`${text} text-xs font-bold`}>{label}</p>
                <p className="text-white font-bold">{arauto?.display_name ?? '—'}</p>
                {arauto?.arauto_response === 'accepted' && (
                  <p className="text-emerald-400 text-[11px] font-semibold">✅ Aceitou</p>
                )}
                {arauto?.arauto_response === 'declined' && (
                  <p className="text-red-400 text-[11px] font-semibold">❌ Prefere não ser</p>
                )}
                {arauto?.arauto_response === 'pending' && (
                  <p className="text-slate-500 text-[11px]">⏳ A aguardar resposta</p>
                )}
                <button
                  onClick={() => setArautoPicker(arautoPicker === tid ? null : tid)}
                  className="text-slate-400 hover:text-white text-[11px] underline disabled:opacity-40"
                  disabled={loading || (tid === 'a' ? teamA.length : teamB.length) < 2}
                >
                  Escolher outro
                </button>
                {arautoPicker === tid && <div className="pt-1">{renderArautoPicker(tid)}</div>}
              </div>
            )
          )}
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
    const label = TEAM_LABELS[activeTeam]
    const isHinting = session.current_phase === 'hinting'

    return wrap(
      <div className={`min-h-screen ${vwSans.className} p-3`} style={VW_SCREEN_STYLE}>
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
            <div className="rounded-xl p-3 border" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'a' ? VW.amber : VW.pline }}>
              <p className="text-xs font-bold" style={{ color: VW.amber }}>Leão</p>
              <p className={`${vwSerif.className} font-semibold text-xl`}>{revealedA} / {wordsA.length}</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ ...VW_PANEL_STYLE, borderColor: activeTeam === 'b' ? VW.blue : VW.pline }}>
              <p className="text-xs font-bold" style={{ color: VW.blue }}>Águia</p>
              <p className={`${vwSerif.className} font-semibold text-xl`}>{revealedB} / {wordsB.length}</p>
            </div>
          </div>

          {/* Estado do turno */}
          <div className="rounded-xl p-3 border" style={teamPanelStyle(activeTeam, { strong: true })}>
            <div className="flex items-center justify-between">
              <p className="font-bold"><TeamChip team={activeTeam} label={`Equipa ${label}`} /></p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: activeTeam === 'a' ? VW.amber : VW.blue }}>
                {isHinting ? 'A dar dica' : `${session.guesses_remaining} tentativa(s) restante(s)`}
              </span>
            </div>
            {session.current_hint && (
              <p className={`${vwSerif.className} mt-1 text-lg font-semibold`}>
                «{session.current_hint}» — {session.current_hint_number}
              </p>
            )}
          </div>

          {/* Dica (fase hinting, host pode submeter em vez do arauto) */}
          {isHinting && (
            <div className="rounded-xl p-4 border space-y-3" style={VW_PANEL_STYLE}>
              <p className="text-sm font-semibold" style={{ color: VW.mut }}>Submeter dica (Arauto ou Host)</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm border uppercase"
                  style={{ background: '#0b1226', borderColor: VW.pline, color: VW.ink }}
                  placeholder="Palavra-dica"
                  value={hintInput}
                  onChange={(e) => setHintInput(e.target.value)}
                />
                <div className="flex shrink-0 items-stretch rounded-lg border overflow-hidden" style={{ background: '#0b1226', borderColor: VW.pline }}>
                  <button
                    type="button"
                    onClick={() => setHintNumber((n) => Math.max(1, n - 1))}
                    disabled={hintNumber <= 1}
                    aria-label="Diminuir"
                    className="px-2.5 flex items-center hover:bg-white/5 disabled:opacity-30"
                    style={{ color: VW.mut }}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className={`${vwSerif.className} w-7 flex items-center justify-center text-sm font-semibold tabular-nums select-none`}>
                    {hintNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHintNumber((n) => Math.min(5, n + 1))}
                    disabled={hintNumber >= 5}
                    aria-label="Aumentar"
                    className="px-2.5 flex items-center hover:bg-white/5 disabled:opacity-30"
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
                  className="px-4 py-2 shrink-0 rounded-lg font-bold text-sm disabled:opacity-40 transition-colors"
                  style={{ background: TEAM_GRADIENT[activeTeam], color: activeTeam === 'a' ? '#1e1305' : '#f5f9ff' }}
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
              onWordClick={!isHinting ? handleConfirmWord : undefined}
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

    return wrap(
      <div className={`min-h-screen ${vwSans.className} flex flex-col items-center justify-center p-6 gap-6`} style={VW_SCREEN_STYLE}>
        <div className="text-center">
          <p className="text-6xl mb-3">{icon}</p>
          <h1 className={`${vwSerif.className} text-3xl font-semibold`}>
            {winner ? `Equipa ${label} venceu!` : 'Jogo terminado!'}
          </h1>
          {session.win_reason === 'black_hit' && (
            <p className="text-red-400 text-sm mt-1">A palavra preta foi revelada! 💀</p>
          )}
          {session.win_reason === 'all_found' && winner && (
            <p className="text-sm mt-1" style={{ color: winner === 'a' ? VW.amber : VW.blue }}>Todas as palavras da equipa foram encontradas!</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(['a', 'b'] as TeamId[]).map((tid) => (
            <div key={tid} className="rounded-2xl p-4 border text-center" style={tid === winner ? teamPanelStyle(tid) : VW_PANEL_STYLE}>
              <p className="font-bold mb-2"><TeamChip team={tid} label={TEAM_LABELS[tid]} /></p>
              {players.filter((p) => p.team === tid).map((p) => (
                <p key={p.id} className="text-sm" style={{ color: 'rgba(238,241,248,.8)' }}>{p.display_name}</p>
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
