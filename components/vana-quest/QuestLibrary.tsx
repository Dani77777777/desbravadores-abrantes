'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, Copy, ListChecks, Pencil, Play, Plus, Search, Trash2, Type, X } from 'lucide-react'
import {
  createVanaQuest,
  deleteVanaQuest,
  duplicateVanaQuest,
  startSession,
  updateVanaQuest,
} from '@/lib/actions/vana-quest'
import { QuestDetailsForm } from './QuestDetailsForm'

export interface LibraryQuest {
  id: string
  title: string
  description: string | null
  createdLabel: string
  questionCount: number
  sessionCount: number
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function QuestLibrary({ quests }: { quests: LibraryQuest[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return quests
    return quests.filter((quest) => normalize(`${quest.title} ${quest.description ?? ''}`).includes(q))
  }, [quests, query])

  function run(id: string | null, work: () => Promise<void>, errorMessage: string) {
    setBusyId(id)
    startTransition(async () => {
      try {
        await work()
      } catch {
        toast.error(errorMessage)
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleCreate(formData: FormData) {
    run('new', async () => {
      const quest = await createVanaQuest(formData)
      router.push(`/admin/vana-quest/${quest.id}`)
    }, 'Não foi possível criar o VanaQuest.')
  }

  function handleRename(id: string, formData: FormData) {
    run(id, async () => {
      await updateVanaQuest(id, formData)
      setRenamingId(null)
      router.refresh()
      toast.success('Nome guardado.')
    }, 'Não foi possível guardar o nome.')
  }

  function handleStart(quest: LibraryQuest) {
    run(quest.id, async () => {
      const sessionId = await startSession(quest.id)
      router.push(`/jogos/vana-quest/${sessionId}/control`)
    }, 'Não foi possível iniciar a sessão.')
  }

  function handleDuplicate(quest: LibraryQuest) {
    run(quest.id, async () => {
      await duplicateVanaQuest(quest.id)
      router.refresh()
      toast.success(`"${quest.title}" duplicado.`)
    }, 'Não foi possível duplicar.')
  }

  function handleDelete(quest: LibraryQuest) {
    const extra = quest.sessionCount > 0
      ? `\n\nTambém apaga ${quest.sessionCount} ${quest.sessionCount === 1 ? 'sessão já jogada' : 'sessões já jogadas'} e os respetivos relatórios.`
      : ''
    const perguntas = `${quest.questionCount} pergunta${quest.questionCount !== 1 ? 's' : ''}`
    if (!confirm(`Eliminar "${quest.title}" e as suas ${perguntas}?${extra}\n\nEsta ação não pode ser desfeita.`)) return
    run(quest.id, async () => {
      await deleteVanaQuest(quest.id)
      router.refresh()
      toast.success('VanaQuest eliminado.')
    }, 'Não foi possível eliminar.')
  }

  const secondaryBtn =
    'flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl text-xs font-semibold text-gray-600 border sm:border-0 hover:bg-gray-100 transition-colors disabled:opacity-50'

  return (
    <div className="space-y-4">
      {/* Criar */}
      {creating ? (
        <div className="bg-white rounded-2xl border shadow-sm p-4 sm:p-6">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" /> Novo VanaQuest
          </h2>
          <QuestDetailsForm
            submitLabel="Criar e adicionar perguntas"
            autoFocus
            pending={pending && busyId === 'new'}
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 bg-blue-900 text-white py-3 rounded-2xl font-bold hover:bg-blue-800 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" /> Novo VanaQuest
        </button>
      )}

      {/* Pesquisa */}
      {quests.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar VanaQuest..."
            aria-label="Procurar VanaQuest"
            className="w-full bg-white border rounded-2xl pl-11 pr-11 py-3 text-base sm:text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Lista */}
      {quests.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-10 text-center text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Ainda não existem VanaQuests.</p>
          <p className="text-sm">Cria o primeiro no botão acima.</p>
        </div>
      )}

      {quests.length > 0 && visible.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-6">
          Nenhum VanaQuest com &quot;{query}&quot;.
        </p>
      )}

      <ul className="space-y-3">
        {visible.map((quest) => {
          const busy = pending && busyId === quest.id
          const empty = quest.questionCount === 0

          if (renamingId === quest.id) {
            return (
              <li key={quest.id} className="bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ring-2 ring-blue-500">
                <p className="text-sm font-bold text-blue-600 flex items-center gap-1.5 mb-3">
                  <Type className="w-3.5 h-3.5" /> Mudar o nome
                </p>
                <QuestDetailsForm
                  initialTitle={quest.title}
                  initialDescription={quest.description}
                  submitLabel="Guardar"
                  autoFocus
                  pending={busy}
                  onSubmit={(fd) => handleRename(quest.id, fd)}
                  onCancel={() => setRenamingId(null)}
                />
              </li>
            )
          }

          return (
            <li
              key={quest.id}
              className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 space-y-3 transition-opacity ${busy ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 break-words">{quest.title}</h3>
                {quest.description && (
                  <p className="text-sm text-gray-500 break-words">{quest.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 ${
                    empty ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50'
                  }`}>
                    <ListChecks className="w-3 h-3" />
                    {empty ? 'Sem perguntas' : `${quest.questionCount} pergunta${quest.questionCount !== 1 ? 's' : ''}`}
                  </span>
                  <span className="text-xs text-gray-400">Criado a {quest.createdLabel}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => handleStart(quest)}
                    disabled={empty || busy}
                    title={empty ? 'Adiciona perguntas para poder iniciar' : undefined}
                    className="flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" /> {busy ? 'A abrir...' : 'Iniciar'}
                  </button>
                  <Link
                    href={`/admin/vana-quest/${quest.id}`}
                    className="flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-semibold border hover:bg-gray-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Perguntas
                  </Link>
                </div>

                <div className="flex gap-2 sm:gap-0 sm:ml-auto">
                  <button type="button" onClick={() => setRenamingId(quest.id)} disabled={busy} className={secondaryBtn}>
                    <Type className="w-4 h-4" /> Renomear
                  </button>
                  <button type="button" onClick={() => handleDuplicate(quest)} disabled={busy} className={secondaryBtn}>
                    <Copy className="w-4 h-4" /> Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(quest)}
                    disabled={busy}
                    className={`${secondaryBtn} hover:!bg-red-50 hover:text-red-600`}
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
