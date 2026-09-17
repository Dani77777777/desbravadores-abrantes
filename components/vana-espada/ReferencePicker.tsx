'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Delete, Check, BookOpen } from 'lucide-react'
import {
  MAX_VERSE,
  NEW_TESTAMENT,
  OLD_TESTAMENT,
  SECTION_COLORS,
  SECTION_LABELS,
  chaptersOf,
  getBook,
  type BibleSection,
} from '@/utils/bible-books'
import type { EspadaGuess } from '@/types/vana-espada'

interface Props {
  disabled?: boolean
  onSubmit: (guess: EspadaGuess) => void
}

type Step = 'book' | 'chapter' | 'verse'

/**
 * Seletor de referência em 3 passos: livro → capítulo → versículo.
 *
 * O botão "Só sei o livro" existe de propósito a partir do passo 2: os mais novos
 * jogam, pontuam e não ficam bloqueados à espera de saber o capítulo.
 * Todos os alvos têm pelo menos 44 px, para se carregar com o polegar.
 */
export function ReferencePicker({ disabled = false, onSubmit }: Props) {
  const [step, setStep] = useState<Step>('book')
  const [testament, setTestament] = useState<'old' | 'new'>('old')
  const [bookId, setBookId] = useState<number | null>(null)
  const [chapter, setChapter] = useState<number | null>(null)
  const [verseInput, setVerseInput] = useState('')

  const book = getBook(bookId ?? undefined)
  const books = testament === 'old' ? OLD_TESTAMENT : NEW_TESTAMENT

  const chapters = useMemo(
    () => (bookId ? Array.from({ length: chaptersOf(bookId) }, (_, i) => i + 1) : []),
    [bookId]
  )

  function pickBook(id: number) {
    setBookId(id)
    setChapter(null)
    setVerseInput('')
    // Livros de um só capítulo (Obadias, Judas, 2 e 3 João, Filémon) saltam o passo 2.
    if (chaptersOf(id) === 1) {
      setChapter(1)
      setStep('verse')
    } else {
      setStep('chapter')
    }
  }

  function pickChapter(n: number) {
    setChapter(n)
    setVerseInput('')
    setStep('verse')
  }

  function pressDigit(digit: string) {
    setVerseInput((prev) => {
      const next = (prev + digit).replace(/^0+/, '')
      if (next.length > 3) return prev
      return Number(next) > MAX_VERSE ? prev : next
    })
  }

  function submitBookOnly() {
    if (!bookId || disabled) return
    onSubmit({ bookId, chapter: null, verse: null })
  }

  function submitFull() {
    if (!bookId || chapter == null || disabled) return
    const verse = verseInput ? Number(verseInput) : null
    onSubmit({ bookId, chapter, verse })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Migalhas: onde estou e como volto atrás */}
      <div className="flex items-center gap-2 px-1 pb-2 flex-shrink-0">
        {step !== 'book' && (
          <button
            onClick={() => setStep(step === 'verse' && chaptersOf(bookId ?? 0) > 1 ? 'chapter' : 'book')}
            className="p-2 -ml-1 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={`font-black truncate ${book ? 'text-white text-lg' : 'text-amber-300 text-sm uppercase tracking-widest'}`}>
            {book ? book.name : 'Escolhe o livro'}
          </span>
          {chapter != null && <span className="text-amber-300 font-black text-lg">{chapter}</span>}
          {chapter != null && verseInput && <span className="text-amber-300 font-black text-lg">:{verseInput}</span>}
        </div>
      </div>

      {/* PASSO 1 — livro */}
      {step === 'book' && (
        <div className="flex flex-col min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-2 mb-2 flex-shrink-0">
            {(['old', 'new'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTestament(t)}
                className={`py-2.5 rounded-xl font-black text-sm transition-colors ${
                  testament === t
                    ? 'bg-amber-400 text-slate-900'
                    : 'bg-white/10 text-white/70 hover:bg-white/15'
                }`}
              >
                {t === 'old' ? 'Antigo T.' : 'Novo T.'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-1.5 overflow-y-auto min-h-0 flex-1 pb-2 content-start">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => pickBook(b.id)}
                disabled={disabled}
                title={b.name}
                className={`${SECTION_COLORS[b.section].bg} min-h-[3rem] rounded-xl text-white font-black text-base leading-none flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 shadow`}
              >
                {b.abbr}
              </button>
            ))}
          </div>

          <SectionLegend testament={testament} />
        </div>
      )}

      {/* PASSO 2 — capítulo */}
      {step === 'chapter' && book && (
        <div className="flex flex-col min-h-0 flex-1">
          <p className="text-white/50 text-xs font-bold uppercase tracking-widest px-1 pb-2 flex-shrink-0">
            Capítulo · 1 a {book.chapters}
          </p>
          <div className="grid grid-cols-5 gap-1.5 overflow-y-auto min-h-0 flex-1 pb-2 content-start">
            {chapters.map((n) => (
              <button
                key={n}
                onClick={() => pickChapter(n)}
                disabled={disabled}
                className="min-h-[3rem] rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg tabular-nums active:scale-95 transition-transform disabled:opacity-50"
              >
                {n}
              </button>
            ))}
          </div>
          <BookOnlyButton onClick={submitBookOnly} disabled={disabled} bookName={book.name} />
        </div>
      )}

      {/* PASSO 3 — versículo */}
      {step === 'verse' && book && chapter != null && (
        <div className="flex flex-col min-h-0 flex-1">
          <div className="bg-white/10 rounded-2xl py-3 text-center flex-shrink-0 mb-2 border border-white/10">
            <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">Versículo</p>
            <p className="text-white font-black text-4xl tabular-nums leading-tight">
              {verseInput || <span className="text-white/25">—</span>}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 flex-1 min-h-0">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => pressDigit(d)}
                disabled={disabled}
                className="min-h-[3rem] rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-2xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => setVerseInput('')}
              disabled={disabled}
              className="min-h-[3rem] rounded-xl bg-white/5 hover:bg-white/10 text-white/50 font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
            >
              Limpar
            </button>
            <button
              onClick={() => pressDigit('0')}
              disabled={disabled}
              className="min-h-[3rem] rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-2xl active:scale-95 transition-transform disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={() => setVerseInput((v) => v.slice(0, -1))}
              disabled={disabled}
              className="min-h-[3rem] rounded-xl bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              aria-label="Apagar"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={submitFull}
            disabled={disabled}
            className="mt-2 w-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl flex-shrink-0"
          >
            <Check className="w-5 h-5" />
            {verseInput ? `Confirmar ${book.abbr} ${chapter}:${verseInput}` : `Confirmar só ${book.abbr} ${chapter}`}
          </button>
          <BookOnlyButton onClick={submitBookOnly} disabled={disabled} bookName={book.name} />
        </div>
      )}
    </div>
  )
}

function BookOnlyButton({
  onClick,
  disabled,
  bookName,
}: {
  onClick: () => void
  disabled: boolean
  bookName: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-1.5 w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0"
    >
      <BookOpen className="w-4 h-4" /> Só sei o livro ({bookName})
    </button>
  )
}

/** Legenda compacta das cores, só das secções visíveis no separador atual. */
function SectionLegend({ testament }: { testament: 'old' | 'new' }) {
  const sections: BibleSection[] =
    testament === 'old'
      ? ['law', 'history', 'poetry', 'major_prophets', 'minor_prophets']
      : ['gospels', 'acts', 'pauline', 'general', 'apocalyptic']

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 flex-shrink-0">
      {sections.map((s) => (
        <span key={s} className="flex items-center gap-1 text-[10px] text-white/50 font-semibold">
          <span className={`w-2 h-2 rounded-sm ${SECTION_COLORS[s].bg}`} />
          {SECTION_LABELS[s]}
        </span>
      ))}
    </div>
  )
}
