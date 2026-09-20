'use client'

import { useState } from 'react'
import { Sparkles, AlertCircle, Check } from 'lucide-react'
import { awardRewards } from '@/lib/actions/vana-camp'

/**
 * Botão minimal para atribuir XP/Gold a partir do admin.
 * Só aparece enquanto os prémios ainda não foram atribuídos.
 */
export function AwardRewardsButton({
  sessionId,
  initiallyAwarded,
}: {
  sessionId: string
  initiallyAwarded: boolean
}) {
  const [awarded, setAwarded] = useState(initiallyAwarded)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Já estava atribuído à partida → nada a mostrar (o cartão de meta já indica).
  if (awarded && !msg) return null

  async function handle() {
    if (!confirm('Atribuir XP e Gold a todos os jogadores? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    setError(null)
    const r = await awardRewards(sessionId)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setMsg(`✓ Prémios atribuídos a ${r.awarded ?? 0} jogador(es).${r.skipped_bots ? ` ${r.skipped_bots} bot(s) ignorados.` : ''}`)
    setAwarded(true)
  }

  return (
    <section className="space-y-2">
      {msg ? (
        <div className="bg-emerald-950/40 border border-emerald-700/40 text-emerald-200 rounded p-3 text-sm flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {msg}
        </div>
      ) : (
        <button
          onClick={handle}
          disabled={busy}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-bold py-3 rounded transition flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" /> {busy ? 'A atribuir…' : 'Atribuir XP e Gold'}
        </button>
      )}
      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
    </section>
  )
}
