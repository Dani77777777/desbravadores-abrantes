'use client'

import { useState } from 'react'
import { joinVanaWordsSession } from '@/lib/actions/vana-words'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'

interface VanaWordsHomeProps {
  userId: string | null
  isDesbravador: boolean
}

export function VanaWordsHome({ userId, isDesbravador }: VanaWordsHomeProps) {
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

  if (!isDesbravador) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-24 w-auto object-contain drop-shadow-2xl" />
        <p className="text-slate-400 max-w-sm">
          Este jogo é exclusivo para Desbravadores inscritos. Se és coordenador ou dirigente, inicia sessão no painel de administração.
        </p>
        <a href="/admin/vana-words" className="text-emerald-400 underline text-sm">Ir para Admin →</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-8">
      <div className="flex flex-col items-center text-center gap-3">
        <img src="/images/VanaWords.png" alt="VanaWords" className="h-28 w-auto object-contain drop-shadow-2xl" />
        <p className="text-slate-400">O jogo das palavras secretas</p>
      </div>

      <form onSubmit={handleJoin} className="w-full max-w-xs space-y-4">
        <div>
          <label className="text-slate-400 text-sm block mb-1">Código de entrada</label>
          <input
            className="w-full bg-slate-800 text-white text-2xl font-black tracking-widest rounded-2xl px-5 py-4 border border-slate-700 text-center uppercase focus:outline-none focus:border-emerald-500"
            placeholder="XXXX"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-lg transition-colors"
        >
          {loading ? 'A entrar…' : 'Entrar no Jogo'}
        </button>
      </form>

      <p className="text-slate-600 text-xs">Pede o código ao teu líder ou coordenador</p>
    </div>
  )
}
