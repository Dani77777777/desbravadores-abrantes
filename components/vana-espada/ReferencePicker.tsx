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

/** Secções por testamento, pela ordem canónica. */
const SECTIONS: Record<'old' | 'new', BibleSection[]> = {
  old: ['law', 'history', 'poetry', 'major_prophets', 'minor_prophets'],
  new: ['gospels', 'acts', 'pauline', 'general', 'apocalyptic'],
}

/**
 * Seletor de referência em 3 passos: livro → capítulo → versículo.
 *
 * Os livros aparecem agrupados por secção (Lei, História, Poéticos…) em vez de
 * uma grelha corrida de 39 botões: procura-se "Salmos" debaixo de "Poéticos" em
 * vez de varrer o alfabeto todo — e ensina a arrumação da Bíblia pelo caminho.
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
  const accent = book ? SECTION_COLORS[book.section] : null

  const booksBySection = useMemo(() => {
    const all = testament === 'old' ? OLD_TESTAMENT : NEW_TESTAMENT
    return SECTIONS[testament].map((section) => ({
      section,
      books: all.filter((b) => b.section === section),
    }))
  }, [testament])

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

  function goBack() {
    if (step === 'verse') {
      // Livro de um capítulo só: o passo do capítulo não existe, volta ao livro.
      setStep(chaptersOf(bookId ?? 0) > 1 ? 'chapter' : 'book')
    } else if (step === 'chapter') {
      setStep('book')
    }
  }

  function submitBookOnly() {
    if (!bookId || disabled) return
    onSubmit({ bookId, chapter: null, verse: null })
  }

  function submitFull() {
    if (!bookId || chapter == null || disabled) return
    onSubmit({ bookId, chapter, verse: verseInput ? Number(verseInput) : null })
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* ── A referência a construir-se ──────────────────────────── */}
      <div
        className="flex-shrink-0 rounded-2xl border border-white/15 bg-white/[0.07] overflow-hidden"
        style={accent ? { boxShadow: `inset 4px 0 0 ${accent.hex}` } : undefined}
      >
        <div className="flex items-stretch">
          {step !== 'book' && (
            <button
              onClick={goBack}
              disabled={disabled}
              className="px-3 text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="flex-1 min-w-0 flex items-baseline gap-2 px-3 py-2.5">
            <Slot
              label="Livro"
              value={book?.name ?? null}
              active={step === 'book'}
              onClick={() => setStep('book')}
              disabled={disabled || !book}
              grow
            />
            <Slot
              label="Cap."
              value={chapter != null ? String(chapter) : null}
              active={step === 'chapter'}
              onClick={() => book && chaptersOf(book.id) > 1 && setStep('chapter')}
              disabled={disabled || !book}
            />
            <Slot
              label="Vers."
              value={verseInput || null}
              active={step === 'verse'}
              onClick={() => chapter != null && setStep('verse')}
              disabled={disabled || chapter == null}
            />
          </div>
        </div>
      </div>

      {/* ── PASSO 1 — livro ──────────────────────────────────────── */}
      {step === 'book' && (
        <div className="flex flex-col min-h-0 flex-1 gap-2">
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            {(['old', 'new'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTestament(t)}
                className={`py-3 rounded-xl font-black text-base transition-all active:scale-95 ${
                  testament === t
                    ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20'
                    : 'bg-white/10 text-white/60 hover:bg-white/15'
                }`}
              >
                {t === 'old' ? 'Antigo T.' : 'Novo T.'}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto min-h-0 flex-1 space-y-3 pb-1">
            {booksBySection.map(({ section, books }) => (
              <div key={section}>
                <div className="flex items-center gap-2 mb-1.5 px-0.5">
                  <span className={`w-2.5 h-2.5 rounded-sm ${SECTION_COLORS[section].bg}`} />
                  <span className="text-white/45 text-[11px] font-black uppercase tracking-[0.15em]">
                    {SECTION_LABELS[section]}
                  </span>
                  <span className="flex-1 h-px bg-white/10" />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {books.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => pickBook(b.id)}
                      disabled={disabled}
                      title={b.name}
                      className={`${SECTION_COLORS[b.section].bg} min-h-[3.25rem] rounded-xl px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-white active:scale-95 transition-transform disabled:opacity-50 shadow-md`}
                    >
                      <span className="font-black text-lg leading-none">{b.abbr}</span>
                      <span className="text-[8px] font-bold leading-none opacity-75 max-w-full truncate">
                        {b.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PASSO 2 — capítulo ───────────────────────────────────── */}
      {step === 'chapter' && book && accent && (
        <div className="flex flex-col min-h-0 flex-1 gap-2">
          <p className="text-white/45 text-[11px] font-black uppercase tracking-[0.15em] flex-shrink-0 px-0.5">
            Que capítulo? · 1 a {book.chapters}
          </p>
          <div className="grid grid-cols-5 gap-1.5 overflow-y-auto min-h-0 flex-1 content-start pb-1">
            {chapters.map((n) => (
              <button
                key={n}
                onClick={() => pickChapter(n)}
                disabled={disabled}
                className="min-h-[3.25rem] rounded-xl text-white font-black text-xl tabular-nums active:scale-95 transition-transform disabled:opacity-50 border border-white/10"
                style={{ backgroundColor: `${accent.hex}40` }}
              >
                {n}
              </button>
            ))}
          </div>
          <BookOnlyButton onClick={submitBookOnly} disabled={disabled} bookName={book.name} />
        </div>
      )}

      {/* ── PASSO 3 — versículo ──────────────────────────────────── */}
      {step === 'verse' && book && chapter != null && (
        <div className="flex flex-col min-h-0 flex-1 gap-2">
          <div className="bg-white/[0.07] border border-white/15 rounded-2xl py-2.5 text-center flex-shrink-0">
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Que versículo?</p>
            <p className="font-black leading-tight text-4xl">
              <span className="text-white">{book.abbr} {chapter}</span>
              <span className="text-white/25">:</span>
              <span className="text-amber-300 tabular-nums">{verseInput || '—'}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 flex-1 min-h-0">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Key key={d} onClick={() => pressDigit(d)} disabled={disabled}>{d}</Key>
            ))}
            <Key onClick={() => setVerseInput('')} disabled={disabled} muted>
              <span className="text-sm">Limpar</span>
            </Key>
            <Key onClick={() => pressDigit('0')} disabled={disabled}>0</Key>
            <Key onClick={() => setVerseInput((v) => v.slice(0, -1))} disabled={disabled} muted>
              <Delete className="w-6 h-6" />
            </Key>
          </div>

          <button
            onClick={submitFull}
            disabled={disabled}
            className="w-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-amber-400/20 flex-shrink-0"
          >
            <Check className="w-5 h-5" />
            Confirmar {book.abbr} {chapter}{verseInput ? `:${verseInput}` : ''}
          </button>
          <BookOnlyButton onClick={submitBookOnly} disabled={disabled} bookName={book.name} />
        </div>
      )}
    </div>
  )
}

/** Uma das três partes da referência no cabeçalho. Clicar volta a esse passo. */
function Slot({
  label, value, active, onClick, disabled, grow,
}: {
  label: string
  value: string | null
  active: boolean
  onClick: () => void
  disabled: boolean
  grow?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left min-w-0 rounded-lg px-1.5 py-0.5 transition-colors ${grow ? 'flex-1' : 'flex-shrink-0'} ${
        active ? 'bg-amber-400/15' : 'hover:bg-white/5'
      } disabled:cursor-default`}
    >
      <span className={`block text-[9px] font-black uppercase tracking-[0.15em] leading-none ${
        active ? 'text-amber-300' : 'text-white/35'
      }`}>
        {label}
      </span>
      <span className={`block font-black leading-tight truncate ${
        value ? 'text-white text-xl' : 'text-white/20 text-xl'
      }`}>
        {value ?? '—'}
      </span>
    </button>
  )
}

function Key({
  children, onClick, disabled, muted,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[3.25rem] rounded-xl font-black text-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50 ${
        muted ? 'bg-white/5 text-white/55 hover:bg-white/10' : 'bg-white/10 text-white hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

function BookOnlyButton({
  onClick, disabled, bookName,
}: {
  onClick: () => void
  disabled: boolean
  bookName: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white/75 font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0"
    >
      <BookOpen className="w-4 h-4" /> Só sei o livro ({bookName})
    </button>
  )
}
