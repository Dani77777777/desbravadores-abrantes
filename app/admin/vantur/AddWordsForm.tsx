'use client'

import { useState, useTransition } from 'react'
import { Plus, CheckCircle2, AlertCircle } from 'lucide-react'
import { addBiblicalWords, addGeneralWords, type AddWordsResult } from '@/lib/actions/vantur-admin'

interface Props {
  target: 'biblical' | 'general'
  accent: 'blue' | 'amber'
  placeholder: string
}

const STYLES = {
  blue: {
    input: 'bg-blue-50/30 border-blue-100 focus:border-blue-600 text-blue-900 placeholder:text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
  },
  amber: {
    input: 'bg-amber-50/30 border-amber-100 focus:border-amber-500 text-amber-900 placeholder:text-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
  },
}

/**
 * Adicionar uma ou várias palavras de uma vez (separadas por espaços, vírgulas
 * ou linhas). No fim mostra o que entrou, o que já lá estava e o que foi recusado.
 */
export function AddWordsForm({ target, accent, placeholder }: Props) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<AddWordsResult | null>(null)
  const [pending, startTransition] = useTransition()
  const s = STYLES[accent]

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    startTransition(async () => {
      const res = target === 'biblical' ? await addBiblicalWords(text) : await addGeneralWords(text)
      setResult(res)
      // Fica na caixa só o que não entrou, para se poder corrigir
      if (!res.error) setText(res.invalid.join(' '))
    })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter adiciona; Shift+Enter muda de linha para colar listas
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) }
          }}
          rows={1}
          placeholder={placeholder}
          className={`min-h-[60px] flex-1 resize-y rounded-2xl border-2 px-6 py-4 text-lg font-black uppercase outline-none transition-all focus:bg-white ${s.input}`}
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className={`flex items-center justify-center gap-2 rounded-2xl px-8 py-4 font-bold text-white shadow-xl transition-all active:scale-95 disabled:opacity-50 ${s.button}`}
        >
          <Plus className="h-5 w-5" /> {pending ? 'A adicionar…' : 'Adicionar'}
        </button>
      </form>
      <p className="pl-2 text-xs font-medium text-slate-400">
        Podes colar várias de uma vez, separadas por espaços, vírgulas ou linhas. Só palavras de 5 letras.
      </p>

      {result && (
        <div className="space-y-1.5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
          {result.error && (
            <p className="flex items-center gap-2 font-semibold text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" /> {result.error}
            </p>
          )}
          {result.added.length > 0 && (
            <p className="flex items-start gap-2 font-semibold text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Adicionada{result.added.length !== 1 ? 's' : ''} ({result.added.length}): {result.added.join(', ')}</span>
            </p>
          )}
          {result.existing.length > 0 && (
            <p className="text-slate-500">Já existia{result.existing.length !== 1 ? 'm' : ''}: {result.existing.join(', ')}</p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-amber-700">Não têm 5 letras (ficaram na caixa): {result.invalid.join(', ')}</p>
          )}
          {!result.error && !result.added.length && !result.existing.length && !result.invalid.length && (
            <p className="text-slate-500">Nada para adicionar.</p>
          )}
        </div>
      )}
    </div>
  )
}
