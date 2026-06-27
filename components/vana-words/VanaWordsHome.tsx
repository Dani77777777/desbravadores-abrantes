'use client'

import { useState } from 'react'
import { joinVanaWordsSession } from '@/lib/actions/vana-words'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Play, RotateCcw } from 'lucide-react'

interface ActiveSession {
  id: string
  code: string
  status: string
}

interface VanaWordsHomeProps {
  userId: string | null
  canPlay: boolean
  activeSessions?: ActiveSession[]
}

const STATUS_LABEL: Record<string, string> = {
  lobby: 'Sala de espera',
  team_preview: 'A definir equipas',
  arauto_spin: 'A escolher Arautos',
  arauto_ready: 'A começar',
  playing: 'A decorrer',
}

export function VanaWordsHome({ userId, canPlay, activeSessions = [] }: VanaWordsHomeProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    const res = await joinVanaWordsSession(code.trim())
    if (res.error) {
      setError(res.error)
    } else if (res.sessionId) {
      router.push(`/jogos/vana-words/${res.sessionId}`)
    }
    setLoading(false)
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className="text-slate-400 text-center max-w-xs">Precisas de fazer login para jogar.</p>
        <a
          href="/login?redirect=/jogos/vana-words"
          className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" /> Fazer Login
        </a>
      </div>
    )
  }

  if (!canPlay) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className="text-slate-400 max-w-sm">
          Este jogo é exclusivo para membros do clube. Faz login com a tua conta para jogar.
        </p>
        <a href="/login?redirect=/jogos/vana-words" className="text-emerald-400 underline text-sm">Fazer Login →</a>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-8">
      {/* Brilhos decorativos de fundo */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative flex flex-col items-center text-center gap-3">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-28 w-auto object-contain drop-shadow-2xl" />
        <p className="text-slate-300/80 font-medium">O jogo das palavras secretas</p>
      </div>

      <form
        onSubmit={handleJoin}
        className="relative w-full max-w-xs space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md"
      >
        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Código de entrada</label>
          <input
            className="w-full bg-slate-900/70 text-white text-3xl font-black tracking-[0.3em] rounded-2xl px-5 py-4 border border-slate-700 text-center uppercase placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition"
            placeholder="XXXX"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:saturate-50 text-white font-bold text-lg shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition-all"
        >
          {loading ? 'A entrar…' : 'Entrar no Jogo'}
        </button>
      </form>

      {/* Failsafe: jogos a decorrer onde já estás como jogador */}
      {activeSessions.length > 0 && (
        <div className="relative w-full max-w-xs space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-300" />
            <p className="text-emerald-300 text-xs font-black uppercase tracking-widest">
              Jogo{activeSessions.length !== 1 ? 's' : ''} a decorrer
            </p>
          </div>
          {activeSessions.map((s) => (
            <Link
              key={s.id}
              href={`/jogos/vana-words/${s.id}`}
              className="block rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 p-4 transition-all hover:from-emerald-500/30 hover:to-teal-500/30 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/30">
                  <Play className="h-5 w-5 fill-emerald-300 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      {STATUS_LABEL[s.status] || 'A decorrer'}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">{s.code}</span>
                  </div>
                  <p className="truncate text-sm font-bold text-white">VanaWords</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-white/60">Voltar →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="relative text-slate-500 text-xs">Pede o código ao teu líder ou coordenador</p>
    </div>
  )
}
