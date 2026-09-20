'use client'

import { useState, useEffect } from 'react'
import { joinVanaSketchSession } from '@/lib/actions/vana-sketch'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Play, RotateCcw } from 'lucide-react'
import { VS, VS_SCREEN_STYLE, vsHand, vsSans } from './theme'

interface ActiveSession {
  id: string
  code: string
  status: string
}

interface VanaSketchHomeProps {
  userId: string | null
  canPlay: boolean
  activeSessions?: ActiveSession[]
}

const STATUS_LABEL: Record<string, string> = {
  lobby: 'Sala de espera',
  playing: 'A decorrer',
}

export function VanaSketchHome({ userId, canPlay, activeSessions = [] }: VanaSketchHomeProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Prefill do código a partir do link partilhado (?code=XXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('code')
    if (c) setCode(c.toUpperCase())
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    const res = await joinVanaSketchSession(code.trim())
    if (res.error) {
      setError(res.error)
    } else if (res.sessionId) {
      router.push(`/jogos/vana-sketch/${res.sessionId}`)
    }
    setLoading(false)
  }

  if (!userId || !canPlay) {
    return (
      <div className={`min-h-screen ${vsSans.className} flex flex-col items-center justify-center gap-6 p-6 text-center`} style={VS_SCREEN_STYLE}>
        <img src="/images/VanaSketch.png" alt="VanaSketch" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className="max-w-sm text-slate-400">
          {!userId ? 'Precisas de fazer login para jogar.' : 'Este jogo é exclusivo para membros do clube. Faz login com a tua conta para jogar.'}
        </p>
        <a
          href="/login?next=/jogos/vana-sketch"
          className="flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-white"
          style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
        >
          <LogIn className="h-4 w-4" /> Fazer Login
        </a>
      </div>
    )
  }

  return (
    <div className={`relative min-h-screen ${vsSans.className} flex flex-col items-center justify-center gap-8 overflow-hidden p-6`} style={VS_SCREEN_STYLE}>
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <img src="/images/VanaSketch.png" alt="VanaSketch" className="h-28 w-auto object-contain drop-shadow-2xl" />
        <p className={`${vsHand.className} text-3xl font-bold`}>VanaSketch</p>
        <p style={{ color: VS.mut }} className="font-medium">Desenha, adivinha e ri-te à gargalhada</p>
      </div>

      <form
        onSubmit={handleJoin}
        className="relative w-full max-w-xs space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md"
      >
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">Código de entrada</label>
          <input
            className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-4 text-center text-3xl font-black uppercase tracking-[0.3em] text-white placeholder:text-slate-600 transition focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
            placeholder="XXXX"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full rounded-2xl py-4 text-lg font-bold text-white shadow-lg shadow-pink-900/40 transition-all active:scale-[0.98] disabled:opacity-40 disabled:saturate-50"
          style={{ background: 'linear-gradient(160deg,#ff8fc0,#ff5da2)' }}
        >
          {loading ? 'A entrar…' : 'Entrar no Jogo'}
        </button>
      </form>

      {/* Failsafe: jogos a decorrer onde já estás como jogador */}
      {activeSessions.length > 0 && (
        <div className="relative w-full max-w-xs space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-pink-300" />
            <p className="text-xs font-black uppercase tracking-widest text-pink-300">
              Jogo{activeSessions.length !== 1 ? 's' : ''} a decorrer
            </p>
          </div>
          {activeSessions.map((s) => (
            <Link
              key={s.id}
              href={`/jogos/vana-sketch/${s.id}`}
              className="block rounded-2xl border border-pink-400/40 bg-gradient-to-r from-pink-500/20 to-rose-500/20 p-4 transition-all hover:from-pink-500/30 hover:to-rose-500/30 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-400/30">
                  <Play className="h-5 w-5 fill-pink-300 text-pink-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-pink-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" />
                      {STATUS_LABEL[s.status] || 'A decorrer'}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">{s.code}</span>
                  </div>
                  <p className="truncate text-sm font-bold text-white">VanaSketch</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-white/60">Voltar →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="relative text-xs text-slate-500">Pede o código ao teu líder ou coordenador</p>
    </div>
  )
}
