'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteVanaCampSession } from '@/lib/actions/vana-camp'

export function DeleteVanaCampSessionButton({ sessionId, code }: { sessionId: string; code: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!confirm(`Apagar definitivamente a sessão ${code}? Esta ação não pode ser desfeita.`)) return
    setBusy(true)
    const r = await deleteVanaCampSession(sessionId)
    setBusy(false)
    if (r.error) alert(r.error)
    else router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-stone-500 hover:text-red-400 transition disabled:opacity-50"
      title="Apagar sessão"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}
