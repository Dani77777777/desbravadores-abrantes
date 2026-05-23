'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinSession } from '@/lib/actions/vana-quest'

interface Props {
  user: any
  profile: any
  initialPin: string
}

export function JoinForm({ user, profile, initialPin }: Props) {
  const router = useRouter()
  const [pin, setPin] = useState(initialPin)
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await joinSession(
      pin.trim(),
      user ? profile?.full_name || 'Jogador' : guestName.trim() || 'Convidado',
      user?.id || null
    )

    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Store participant ID so the play screen can use it
    localStorage.setItem(`vana_participant_${result.sessionId}`, result.participantId)
    router.push(`/jogos/vana-quest/${result.sessionId}/play`)
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/images/VanaQuest.png"
            alt="VanaQuest"
            className="w-24 h-24 object-contain mx-auto mb-4 drop-shadow-2xl"
          />
          <h1 className="text-4xl font-black text-white tracking-tight">VanaQuest</h1>
          <p className="text-sky-200 mt-1">Entra no jogo com o teu PIN</p>
        </div>

        <form onSubmit={handleJoin} className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20 space-y-4">
          <div>
            <label className="block text-xs font-bold text-sky-200 uppercase tracking-wider mb-2">
              PIN do jogo
            </label>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-2xl px-5 py-4 text-3xl font-black text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>

          {!user && (
            <div>
              <label className="block text-xs font-bold text-sky-200 uppercase tracking-wider mb-2">
                O teu nome
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Como te chamas?"
                required
                maxLength={30}
                className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-2xl px-5 py-3.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              <p className="text-xs text-sky-300 mt-1.5">
                Estás a jogar como convidado. No final podes escolher um desbravador para receber os teus prémios.
              </p>
            </div>
          )}

          {user && (
            <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {profile?.full_name?.[0] || '?'}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{profile?.full_name}</p>
                <p className="text-sky-300 text-xs">Desbravador registado</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-red-200 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6 || (!user && guestName.trim().length < 2)}
            className="w-full bg-white text-blue-900 font-black text-lg py-4 rounded-2xl hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? 'A entrar...' : 'Entrar no jogo'}
          </button>
        </form>
      </div>
    </div>
  )
}
