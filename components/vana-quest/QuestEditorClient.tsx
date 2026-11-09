'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { SortableQuestionList } from './SortableQuestionList'
import { QuestionForm } from './QuestionForm'
import { addQuestion, updateQuestion, deleteQuestion } from '@/lib/actions/vana-quest'

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
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
  const [isAdding, startAdding] = useTransition()

  // O formulário de nova pergunta é recriado depois de cada pergunta guardada
  // (fica vazio), mas mantém o tempo e os pontos da anterior.
  const [formKey, setFormKey] = useState(0)
  const [lastSettings, setLastSettings] = useState({ time: 20, multiplier: 1 })
  const addCardRef = useRef<HTMLDivElement>(null)
  const addTextRef = useRef<HTMLTextAreaElement>(null)

  function handleSaveEdit(formData: FormData) {
    const id = formData.get('id') as string
    startTransition(async () => {
      try {
        await updateQuestion(id, questId, formData)
        setEditingId(undefined)
        router.refresh()
      } catch {
        toast.error('Não foi possível guardar a pergunta.')
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Eliminar esta pergunta?')) return
    startTransition(async () => {
      try {
        await deleteQuestion(id, questId)
        router.refresh()
      } catch {
        toast.error('Não foi possível eliminar a pergunta.')
      }
    })
  }

  function handleAdd(formData: FormData, settings: { time: number; multiplier: number }) {
    startAdding(async () => {
      try {
        await addQuestion(questId, formData)
        setLastSettings(settings)
        setFormKey((k) => k + 1)
        router.refresh()
        toast.success(`Pergunta ${initial.length + 1} adicionada.`)
      } catch {
        toast.error('Não foi possível adicionar a pergunta.')
      }
    })
  }

  function goToNewQuestion() {
    addCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    addTextRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="space-y-4">
      {initial.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Arrasta <span aria-hidden>⠿</span> ou usa as setas para mudar a ordem.
            </p>
            <button
              type="button"
              onClick={goToNewQuestion}
              className="flex-shrink-0 flex items-center gap-1.5 min-h-10 px-3 rounded-xl text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova pergunta
            </button>
          </div>
          <SortableQuestionList
            questions={initial}
            questId={questId}
            editingId={editingId}
            saving={isPending}
            onEdit={setEditingId}
            onCancelEdit={() => setEditingId(undefined)}
            onDelete={handleDelete}
            onSaveEdit={handleSaveEdit}
          />
        </>
      )}

      <div ref={addCardRef} className="bg-white rounded-2xl border shadow-sm p-4 sm:p-6 scroll-mt-4">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" />
          {initial.length === 0 ? 'Adicionar a primeira pergunta' : `Adicionar a pergunta ${initial.length + 1}`}
        </h2>
        <QuestionForm
          key={formKey}
          defaultTime={lastSettings.time}
          defaultMultiplier={lastSettings.multiplier}
          submitLabel="Adicionar pergunta"
          pending={isAdding}
          textareaRef={addTextRef}
          onSubmit={handleAdd}
        />
      </div>
    </div>
  )
}
