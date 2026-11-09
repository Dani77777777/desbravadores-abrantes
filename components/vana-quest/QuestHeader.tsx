'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, Play, Type } from 'lucide-react'
import { startSession, updateVanaQuest } from '@/lib/actions/vana-quest'
import { QuestDetailsForm } from './QuestDetailsForm'

interface Props {
  questId: string
  title: string
  description: string | null
  questionCount: number
}

/** Cabeçalho do editor: voltar, nome (editável) e iniciar sessão. */
export function QuestHeader({ questId, title, description, questionCount }: Props) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [saving, startSaving] = useTransition()
  const [starting, startStarting] = useTransition()

  function handleRename(formData: FormData) {
    startSaving(async () => {
      try {
        await updateVanaQuest(questId, formData)
        setRenaming(false)
        router.refresh()
        toast.success('Nome guardado.')
      } catch {
        toast.error('Não foi possível guardar o nome.')
      }
    })
  }

  function handleStart() {
    startStarting(async () => {
      try {
        const sessionId = await startSession(questId)
        router.push(`/jogos/vana-quest/${sessionId}/control`)
      } catch {
        toast.error('Não foi possível iniciar a sessão.')
      }
    })
  }

  return (
    <div className="space-y-3">
      <Link
        href="/admin/vana-quest"
        className="inline-flex items-center gap-1 -ml-2 px-2 min-h-10 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Todos os VanaQuests
      </Link>

      {renaming ? (
        <div className="bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ring-2 ring-blue-500">
          <QuestDetailsForm
            initialTitle={title}
            initialDescription={description}
            submitLabel="Guardar"
            autoFocus
            pending={saving}
            onSubmit={handleRename}
            onCancel={() => setRenaming(false)}
          />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words min-w-0">{title}</h1>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                aria-label="Mudar o nome e a descrição"
                title="Mudar o nome"
                className="flex-shrink-0 w-9 h-9 -mt-0.5 rounded-lg flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <Type className="w-4 h-4" />
              </button>
            </div>
            {description && <p className="text-sm text-gray-600 break-words">{description}</p>}
            <p className="text-sm text-gray-500">
              {questionCount === 0 ? 'Sem perguntas' : `${questionCount} pergunta${questionCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleStart}
            disabled={questionCount === 0 || starting}
            title={questionCount === 0 ? 'Adiciona perguntas para poder iniciar' : undefined}
            className="flex items-center justify-center gap-1.5 min-h-11 px-6 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4 fill-current" /> {starting ? 'A abrir...' : 'Iniciar sessão'}
          </button>
        </div>
      )}
    </div>
  )
}
