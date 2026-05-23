'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SortableQuestionList } from './SortableQuestionList'
import { updateQuestion, deleteQuestion } from '@/lib/actions/vana-quest'

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  time_seconds: number
  points_multiplier: number
  question_order: number
}

interface Props {
  questions: Question[]
  questId: string
}

export function QuestEditorClient({ questions: initial, questId }: Props) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  function handleEdit(id: string) {
    setEditingId(id)
  }

  function handleCancelEdit() {
    setEditingId(undefined)
  }

  function handleSaveEdit(formData: FormData) {
    const id = formData.get('id') as string
    startTransition(async () => {
      await updateQuestion(id, questId, formData)
      setEditingId(undefined)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Eliminar esta pergunta?')) return
    startTransition(async () => {
      await deleteQuestion(id, questId)
      router.refresh()
    })
  }

  if (initial.length === 0) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-10 text-center text-gray-400">
        <p className="font-medium">Sem perguntas ainda.</p>
        <p className="text-sm">Adiciona a primeira pergunta acima.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
        <span>⠿</span> Arrasta as perguntas para reordenar
      </p>
      <SortableQuestionList
        questions={initial}
        questId={questId}
        editingId={editingId}
        onEdit={handleEdit}
        onCancelEdit={handleCancelEdit}
        onDelete={handleDelete}
        onSaveEdit={handleSaveEdit}
      />
      {isPending && (
        <p className="text-xs text-blue-600 font-semibold text-center animate-pulse mt-3">A guardar...</p>
      )}
    </div>
  )
}
