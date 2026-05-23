'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteSession } from '@/lib/actions/vana-quest'

interface Props {
  sessionId: string
  sessionTitle: string
  compact?: boolean
}

export function DeleteSessionButton({ sessionId, sessionTitle, compact }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const ok = confirm(
      `Eliminar a sessão "${sessionTitle}"?\n\nIsto remove permanentemente todos os jogadores, respostas e estatísticas desta sessão. Esta acção não pode ser desfeita.`
    )
    if (!ok) return
    startTransition(async () => {
      await deleteSession(sessionId)
      router.push('/admin/vana-quest')
      router.refresh()
    })
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={pending}
        title="Eliminar sessão"
        className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 rounded-xl px-4 py-2 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
      {pending ? 'A eliminar...' : 'Eliminar relatório'}
    </button>
  )
}
