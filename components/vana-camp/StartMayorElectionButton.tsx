'use client'

import { useState } from 'react'
import { Crown } from 'lucide-react'
import { startMayorElection } from '@/lib/actions/vana-camp'

export function StartMayorElectionButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <button
        onClick={async () => {
          setBusy(true); setError(null)
          const r = await startMayorElection(sessionId)
          if (r.error) setError(r.error)
          setBusy(false)
        }}
        disabled={busy}
        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded flex items-center gap-2 mx-auto"
      >
        <Crown className="w-5 h-5" /> {busy ? 'A iniciar…' : 'Eleger Diretor'}
      </button>
      {error && <p className="text-red-300 text-sm text-center">{error}</p>}
    </div>
  )
}
