'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react'
import { BIBLE_BOOKS, chaptersOf, getBook } from '@/utils/bible-books'
import { ESPADA_DIFFICULTY_COLORS, ESPADA_DIFFICULTY_LABELS } from '@/utils/vana-espada-labels'
import { formatReference } from '@/utils/vana-espada'
import { deleteVerse, setVerseActive, upsertVerse } from '@/lib/actions/vana-espada'
import type { EspadaDifficulty } from '@/types/vana-espada'

export interface VerseRow {
  id: string
  book_id: number
  chapter: number
  verse_start: number
  verse_end: number
  excerpt: string | null
  translation: string | null
  difficulty: EspadaDifficulty
  tags: string[]
  active: boolean
}

interface Draft {
  id?: string
  bookId: number
  chapter: number
  verseStart: number
  verseEnd: number
  excerpt: string
  translation: string
  difficulty: EspadaDifficulty
  tags: string
}

const EMPTY: Draft = {
  bookId: 1,
  chapter: 1,
  verseStart: 1,
  verseEnd: 1,
  excerpt: '',
  translation: 'Almeida',
  difficulty: 'easy',
  tags: '',
}

export function VerseBankClient({ verses }: { verses: VerseRow[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function startNew() {
    setError('')
    setDraft({ ...EMPTY })
  }

  function startEdit(v: VerseRow) {
    setError('')
    setDraft({
      id: v.id,
      bookId: v.book_id,
      chapter: v.chapter,
      verseStart: v.verse_start,
      verseEnd: v.verse_end,
      excerpt: v.excerpt ?? '',
      translation: v.translation ?? '',
      difficulty: v.difficulty,
      tags: (v.tags ?? []).join(', '),
    })
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setError('')
    const result = await upsertVerse({
      id: draft.id,
      bookId: draft.bookId,
      chapter: draft.chapter,
      verseStart: draft.verseStart,
      verseEnd: Math.max(draft.verseStart, draft.verseEnd),
      excerpt: draft.excerpt,
      translation: draft.translation,
      difficulty: draft.difficulty,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Não foi possível guardar.')
      return
    }
    setDraft(null)
    router.refresh()
  }

  async function toggle(v: VerseRow) {
    await setVerseActive(v.id, !v.active)
    router.refresh()
  }

  async function remove(id: string) {
    setConfirmDelete(null)
    await deleteVerse(id)
    router.refresh()
  }

  const withExcerpt = verses.filter((v) => v.active && (v.excerpt ?? '').trim()).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          <strong className="text-gray-900">{withExcerpt}</strong> versículo{withExcerpt === 1 ? '' : 's'} ativo
          {withExcerpt === 1 ? '' : 's'} com excerto — são estes que entram no &quot;Onde Está?&quot;.
        </p>
        {!draft && (
          <button
            onClick={startNew}
            className="bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Novo versículo
          </button>
        )}
      </div>

      {/* Formulário */}
      {draft && (
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            {draft.id ? 'Editar versículo' : 'Novo versículo'}
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="col-span-2 sm:col-span-2 text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Livro</span>
              <select
                value={draft.bookId}
                onChange={(e) => {
                  const bookId = Number(e.target.value)
                  setDraft({ ...draft, bookId, chapter: Math.min(draft.chapter, chaptersOf(bookId)) })
                }}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BIBLE_BOOKS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                Capítulo <span className="text-gray-300">/ {chaptersOf(draft.bookId)}</span>
              </span>
              <input
                type="number"
                min={1}
                max={chaptersOf(draft.bookId)}
                value={draft.chapter}
                onChange={(e) => setDraft({ ...draft, chapter: Number(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Dificuldade</span>
              <select
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as EspadaDifficulty })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(ESPADA_DIFFICULTY_LABELS) as EspadaDifficulty[]).map((d) => (
                  <option key={d} value={d}>{ESPADA_DIFFICULTY_LABELS[d]}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Versículo</span>
              <input
                type="number"
                min={1}
                max={176}
                value={draft.verseStart}
                onChange={(e) => {
                  const verseStart = Number(e.target.value)
                  setDraft({ ...draft, verseStart, verseEnd: Math.max(verseStart, draft.verseEnd) })
                }}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Até (opcional)</span>
              <input
                type="number"
                min={draft.verseStart}
                max={176}
                value={draft.verseEnd}
                onChange={(e) => setDraft({ ...draft, verseEnd: Number(e.target.value) })}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="col-span-2 text-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Tradução</span>
              <input
                type="text"
                value={draft.translation}
                onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
                placeholder="Almeida"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
              Excerto — é isto que aparece no projetor
            </span>
            <textarea
              value={draft.excerpt}
              onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
              rows={3}
              placeholder="Escreve o texto do versículo a partir da tradução do clube."
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="block text-xs text-gray-400 mt-1">
              Mantém o excerto curto (uma frase) e indica sempre a tradução: o texto bíblico
              das traduções modernas tem direitos de autor.
            </span>
          </label>

          <label className="block text-sm">
            <span className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
              Etiquetas (separadas por vírgulas)
            </span>
            <input
              type="text"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="memorização, desbravadores"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> {saving ? 'A guardar...' : 'Guardar'}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="border px-5 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {verses.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-12 text-center text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">O banco de versículos está vazio.</p>
          <p className="text-sm">Acrescenta o primeiro acima para poder criar sessões.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm divide-y">
          {verses.map((v) => {
            const book = getBook(v.book_id)
            const noExcerpt = !(v.excerpt ?? '').trim()
            return (
              <div key={v.id} className={`p-4 flex items-start gap-4 ${v.active ? '' : 'opacity-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">
                      {formatReference({
                        bookId: v.book_id,
                        chapter: v.chapter,
                        verseStart: v.verse_start,
                        verseEnd: v.verse_end,
                      })}
                    </p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${ESPADA_DIFFICULTY_COLORS[v.difficulty]}`}>
                      {ESPADA_DIFFICULTY_LABELS[v.difficulty]}
                    </span>
                    {noExcerpt && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        sem excerto
                      </span>
                    )}
                    {(v.tags ?? []).map((t) => (
                      <span key={t} className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                  {v.excerpt ? (
                    <p className="text-sm text-gray-600 italic mt-1 line-clamp-2">
                      &ldquo;{v.excerpt}&rdquo;{v.translation ? ` — ${v.translation}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">
                      Sem texto: só servirá para o modo &quot;Saca a Espada!&quot; (Fase 2).
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{book?.section && book.name}</p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggle(v)}
                    title={v.active ? 'Desativar' : 'Ativar'}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    {v.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEdit(v)}
                    title="Editar"
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(v.id)}
                    title="Apagar"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">Apagar versículo?</h3>
            <p className="text-sm text-gray-600">
              Sai do banco para sempre. As sessões já criadas não são afetadas — cada sessão
              guarda a sua própria cópia das rondas.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => remove(confirmDelete)}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-500"
              >
                Apagar
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
