'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, X, List } from 'lucide-react'

interface Word {
  id: string
  word: string
  created_at: string
}

interface WordBankClientProps {
  initialWords: Word[]
  onAddWord: (formData: FormData) => Promise<{ error?: string }>
  onBulkAdd: (formData: FormData) => Promise<{ added: number; skipped: number; error?: string }>
  onDeleteWord: (formData: FormData) => Promise<{ error?: string }>
}

export function WordBankClient({ initialWords, onAddWord, onBulkAdd, onDeleteWord }: WordBankClientProps) {
  const [words, setWords] = useState(initialWords)
  const [newWord, setNewWord] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function flash(msg: string, ok = true) {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 3000)
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = newWord.trim()
    if (!clean) return
    if (words.some((w) => w.word.toLowerCase() === clean.toLowerCase())) {
      flash(`"${clean}" já existe.`, false)
      return
    }
    const fd = new FormData()
    fd.set('word', clean)
    startTransition(async () => {
      const result = await onAddWord(fd)
      if (result.error) {
        flash(result.error, false)
        return
      }
      setWords((prev) => [...prev, { id: Date.now().toString(), word: clean, created_at: new Date().toISOString() }].sort((a, b) => a.word.localeCompare(b.word)))
      setNewWord('')
      flash(`"${clean}" adicionada!`)
    })
  }

  function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = bulkText.trim()
    if (!raw) return
    const parsed = raw.split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean)
    const newOnes = parsed.filter((w) => !words.some((ex) => ex.word.toLowerCase() === w.toLowerCase()))
    const fd = new FormData()
    fd.set('words', raw)
    startTransition(async () => {
      const result = await onBulkAdd(fd)
      if (result.error) {
        flash(result.error, false)
        return
      }
      const added = newOnes.map((w) => ({ id: Math.random().toString(), word: w, created_at: new Date().toISOString() }))
      setWords((prev) => [...prev, ...added].sort((a, b) => a.word.localeCompare(b.word)))
      setBulkText('')
      setShowBulk(false)
      flash(`${result.added} palavra(s) adicionada(s), ${result.skipped} ignorada(s).`)
    })
  }

  function handleDelete(word: Word) {
    const fd = new FormData()
    fd.set('id', word.id)
    startTransition(async () => {
      const result = await onDeleteWord(fd)
      if (result.error) {
        flash(result.error, false)
        return
      }
      setWords((prev) => prev.filter((w) => w.id !== word.id))
      flash(`"${word.word}" removida.`)
    })
  }

  const filtered = words.filter((w) => w.word.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      {/* Feedback */}
      {feedback && (
        <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${feedback.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {/* Adicionar palavra única */}
      <form onSubmit={handleAddSubmit} className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          placeholder="Nova palavra…"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !newWord.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar
        </button>
        <button
          type="button"
          onClick={() => setShowBulk((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${showBulk ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white border-gray-300 text-slate-600 hover:bg-slate-50'}`}
        >
          <List className="w-4 h-4" /> Importar lista
        </button>
      </form>

      {/* Importar lista em massa */}
      {showBulk && (
        <form onSubmit={handleBulkSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Cola várias palavras separadas por <strong>vírgula</strong>, <strong>ponto e vírgula</strong> ou <strong>nova linha</strong>.
          </p>
          <textarea
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[120px] font-mono"
            placeholder={'Fé, Cruz, Paz\nMontanha\nRio; Leão'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            disabled={isPending}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !bulkText.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold"
            >
              Importar
            </button>
            <button
              type="button"
              onClick={() => { setShowBulk(false); setBulkText('') }}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de palavras */}
      {words.length > 0 && (
        <>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="Pesquisar palavras…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-0 divide-x divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {filtered.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 group">
                  <span className="text-sm text-gray-800 font-medium truncate">{w.word}</span>
                  <button
                    onClick={() => handleDelete(w)}
                    disabled={isPending}
                    className="ml-2 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    title={`Remover "${w.word}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-4 py-6 text-center text-slate-400 text-sm">
                  Nenhuma palavra encontrada.
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            {filtered.length} de {words.length} palavra(s)
            {words.length >= 25
              ? ' ✓ suficientes para jogar'
              : ` — faltam ${25 - words.length} para atingir o mínimo de 25`}
          </p>
        </>
      )}

      {words.length === 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-sm">
          Ainda não há palavras no banco.
          <br />
          <span className="text-xs">Enquanto estiver vazio, o jogo usa a lista padrão integrada (110+ palavras).</span>
        </div>
      )}
    </div>
  )
}
