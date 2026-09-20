'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Star } from 'lucide-react'
import { awardSessionPoints } from '@/lib/actions/vana-espada'

interface Props {
  sessionId: string
  alreadyAwarded: boolean
  awardedAt?: string | null
}

/** Atribuir XP e Gold a partir do relatório da sessão — o mesmo botão do VanaQuest. */
export function AwardSessionButton({ sessionId, alreadyAwarded, awardedAt }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(alreadyAwarded)
  const [error, setError] = useState<string | null>(null)

  function handleAward() {
    if (done) return
    const ok = confirm(
      'Atribuir XP e Gold aos participantes desta sessão?\n\nEsta ação é definitiva — só pode ser feita uma vez.'
    )
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await awardSessionPoints(sessionId)
      if (result.ok || result.alreadyAwarded) {
        setDone(true)
        router.refresh()
      } else {
        setError(result.error || 'Erro a atribuir os prémios.')
      }
    })
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-700 flex-shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-green-800 text-sm">Prémios atribuídos</p>
          {awardedAt && (
            <p className="text-green-700/70 text-xs">
              {new Date(awardedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleAward}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed text-yellow-900 font-black text-base py-3 px-4 rounded-2xl shadow-lg transition-all"
      >
        <Star className="w-4 h-4" />
        {pending ? 'A atribuir...' : 'Atribuir XP e Gold aos participantes'}
      </button>
      {error && <p className="text-red-600 text-xs text-center font-semibold">{error}</p>}
    </div>
  )
}
