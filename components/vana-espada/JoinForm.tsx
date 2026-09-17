'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Play, RotateCcw, Sword, Plus } from 'lucide-react'
import { joinSession } from '@/lib/actions/vana-espada'
import { shortDisplayName } from '@/utils/display-name'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { ESPADA_STATUS_LABELS } from '@/utils/vana-espada-labels'
import type { EspadaStatus } from '@/types/vana-espada'

interface ActiveSession {
  id: string
  pin: string
  status: EspadaStatus
  isHost: boolean
}

interface Props {
  user: { id: string; user_metadata?: { avatar_url?: string | null } } | null
  profile: { full_name?: string | null; avatar_url?: string | null } | null
  initialPin: string
  canHost: boolean
  activeSessions: ActiveSession[]
}

export function JoinForm({ user, profile, initialPin, canHost, activeSessions }: Props) {
  const router = useRouter()
  const [pin, setPin] = useState(initialPin)
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Para onde voltar depois de criar conta / entrar (preserva o PIN escrito).
  const nextUrl = `/jogos/vana-espada${pin ? `?pin=${pin}` : ''}`

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const avatarUrl = user
      ? profile?.avatar_url || user?.user_metadata?.avatar_url || null
      : null

    const result = await joinSession(
      pin.trim(),
      user ? shortDisplayName(profile?.full_name) : guestName.trim() || 'Convidado',
      user?.id || null,
      avatarUrl
    )

    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }

    try {
      localStorage.setItem(`vana_espada_player_${result.sessionId}`, result.playerId)
    } catch {
      // Modo privado / armazenamento bloqueado: a página de jogo tem failsafe
      // para utilizadores com conta e o PIN volta a funcionar.
    }
    router.push(`/jogos/vana-espada/${result.sessionId}/play`)
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/images/VanaEspada.png"
            alt="VanaEspada"
            className="w-24 h-24 object-contain mx-auto mb-4 drop-shadow-2xl"
          />
          <h1 className="text-4xl font-black text-white tracking-tight">VanaEspada</h1>
          <p className="text-sky-200 mt-1">Onde está este versículo?</p>
        </div>

        <form onSubmit={handleJoin} className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20 space-y-4">
          <div>
            <label className="block text-xs font-bold text-sky-200 uppercase tracking-wider mb-2">
              PIN do jogo
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-2xl px-5 py-4 text-3xl font-black text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-amber-300/60"
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
                className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-2xl px-5 py-3.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300/60"
              />
              <p className="text-xs text-sky-300 mt-1.5">
                Estás a jogar como convidado. No final podes escolher um desbravador para receber os teus prémios.
              </p>
            </div>
          )}

          {user && (
            <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
              <PlayerAvatar
                name={profile?.full_name || '?'}
                avatarUrl={profile?.avatar_url || user?.user_metadata?.avatar_url}
                className="w-9 h-9"
                textClassName="text-sm"
                fallbackBg="bg-white/20"
              />
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
            className="w-full bg-amber-400 text-slate-900 font-black text-lg py-4 rounded-2xl hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Sword className="w-5 h-5" />
            {loading ? 'A entrar...' : 'Entrar no jogo'}
          </button>
        </form>

        {canHost && (
          <Link
            href="/jogos/vana-espada/nova"
            className="mt-4 w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Criar sessão
          </Link>
        )}

        {!user && (
          <div className="mt-5 text-center">
            <p className="text-sky-200/80 text-sm">És desbravador do clube?</p>
            <div className="flex items-center justify-center gap-2 mt-1.5 text-sm">
              <Link
                href={`/login?mode=signup&next=${encodeURIComponent(nextUrl)}`}
                className="text-white font-bold underline underline-offset-2"
              >
                Criar conta
              </Link>
              <span className="text-sky-300/50">·</span>
              <Link
                href={`/login?mode=login&next=${encodeURIComponent(nextUrl)}`}
                className="text-white font-bold underline underline-offset-2"
              >
                Entrar
              </Link>
            </div>
            <p className="text-sky-300/60 text-[11px] mt-1.5">
              Com conta, os teus prémios ficam guardados no teu perfil.
            </p>
          </div>
        )}

        {/* Failsafe: sessões a decorrer onde já estás */}
        {activeSessions.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-sky-300" />
              <p className="text-sky-300 text-xs font-black uppercase tracking-widest">
                Jogo{activeSessions.length !== 1 ? 's' : ''} a decorrer
              </p>
            </div>
            {activeSessions.map((s) => (
              <Link
                key={s.id}
                href={`/jogos/vana-espada/${s.id}/${s.isHost ? 'control' : 'play'}`}
                className="block bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/40 rounded-2xl p-4 hover:from-amber-500/30 hover:to-orange-500/30 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400/30 flex items-center justify-center flex-shrink-0">
                    <Play className="w-5 h-5 text-amber-200 fill-amber-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-200 bg-amber-500/20 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                        {ESPADA_STATUS_LABELS[s.status] || 'A decorrer'}
                      </span>
                      <span className="text-white/40 text-[10px] font-mono">PIN {s.pin}</span>
                    </div>
                    <p className="text-white font-bold text-sm truncate">
                      {s.isHost ? 'És o anfitrião desta sessão' : 'Voltar ao teu lugar'}
                    </p>
                  </div>
                  <span className="text-white/60 text-xs font-bold flex-shrink-0">Voltar →</span>
                </div>
              </Link>
            ))}
            <p className="text-sky-300/60 text-[11px] text-center pt-1">
              Reentras no jogo onde estavas, com a tua pontuação intacta.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
