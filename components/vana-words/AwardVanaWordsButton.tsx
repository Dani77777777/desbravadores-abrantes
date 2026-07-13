'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, CheckCircle2, Loader2 } from 'lucide-react'
import { awardVanaWordsPoints } from '@/lib/actions/vana-words'
import { TEAM_LABELS } from '@/types/vana-words'
import type { TeamId } from '@/types/vana-words'

interface Props {
  sessionId: string
  alreadyAwarded: boolean
  winnerTeam: TeamId
  /** Variante pequena para os cards da lista de sessões */
  compact?: boolean
}

/** Atribui os 100 XP / 50 Gold à equipa vencedora — mesmo padrão do AwardSessionButton do VanaQuest */
export function AwardVanaWordsButton({ sessionId, alreadyAwarded, winnerTeam, compact = false }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(alreadyAwarded)
  const [error, setError] = useState<string | null>(null)

  function handleAward() {
    if (done) return
    const ok = confirm(
      `Atribuir 100 XP e 50 Gold à Equipa ${TEAM_LABELS[winnerTeam]}?\n\nEsta acção é definitiva — apenas pode ser feita uma vez.`
    )
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await awardVanaWordsPoints(sessionId)
      if (result?.error) {
        if (result.error === 'Pontos já atribuídos.') {
          setDone(true)
          router.refresh()
        } else {
          setError(result.error)
        }
      } else {
        setDone(true)
        router.refresh()
      }
    })
  }

  if (compact) {
    if (done) {
      return (
        <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Pontos atribuídos
        </span>
      )
    }
    return (
      <div className="flex flex-col gap-1 w-full">
        <button
          onClick={handleAward}
          disabled={pending}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-yellow-900 hover:bg-yellow-300 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
          Atribuir pontos
        </button>
        {error && <p className="text-red-600 text-[11px] text-center font-semibold">{error}</p>}
      </div>
    )
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-700 flex-shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <p className="font-bold text-green-800 text-sm">
          XP e Gold atribuídos à Equipa {TEAM_LABELS[winnerTeam]}
        </p>
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
        <Trophy className="w-4 h-4" />
        {pending ? 'A atribuir…' : `Atribuir 100 XP e 50 Gold à Equipa ${TEAM_LABELS[winnerTeam]}`}
      </button>
      {error && (
        <p className="text-red-600 text-xs text-center font-semibold">{error}</p>
      )}
    </div>
  )
}
