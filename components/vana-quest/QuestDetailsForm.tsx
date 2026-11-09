'use client'

import { useId, useState } from 'react'
import { Check } from 'lucide-react'

interface Props {
  initialTitle?: string
  initialDescription?: string | null
  submitLabel: string
  pending?: boolean
  autoFocus?: boolean
  onSubmit: (formData: FormData) => void
  onCancel?: () => void
}

/** Título + descrição de um VanaQuest. Serve para criar e para mudar o nome. */
export function QuestDetailsForm({
  initialTitle = '',
  initialDescription = '',
  submitLabel,
  pending,
  autoFocus,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId()
  const [title, setTitle] = useState(initialTitle)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim() || pending) return
    onSubmit(new FormData(e.currentTarget))
  }

  const inputClass =
    'w-full border rounded-xl px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => { if (e.key === 'Escape' && onCancel) onCancel() }}
      className="space-y-3"
    >
      <div>
        <label htmlFor={`${id}-title`} className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
          Nome
        </label>
        <input
          id={`${id}-title`}
          name="title"
          required
          maxLength={120}
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Quiz da Criação"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-description`} className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
          Descrição <span className="text-gray-400 normal-case font-medium">(opcional)</span>
        </label>
        <input
          id={`${id}-description`}
          name="description"
          maxLength={200}
          defaultValue={initialDescription ?? ''}
          placeholder="Para que serve ou a quem se destina"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-sm"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="flex-1 sm:flex-none bg-blue-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> {pending ? 'A guardar...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
