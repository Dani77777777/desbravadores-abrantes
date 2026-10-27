'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteBiblicalWord, deleteGeneralWord } from '@/lib/actions/vantur-admin'

interface Props {
  target: 'biblical' | 'general'
  /** id (bíblicas) ou word_clean (dicionário geral) */
  wordKey: string
  label: string
}

export function DeleteWordButton({ target, wordKey, label }: Props) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Apagar "${label}"?`)) return
    startTransition(async () => {
      const res = target === 'biblical' ? await deleteBiblicalWord(wordKey) : await deleteGeneralWord(wordKey)
      if (res.error) alert(`Não foi possível apagar: ${res.error}`)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={`Apagar ${label}`}
      className="rounded-lg p-1 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
