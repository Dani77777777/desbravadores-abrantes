'use client'

import { NEW_TESTAMENT, OLD_TESTAMENT, SECTION_COLORS, getBook, type BibleBook } from '@/utils/bible-books'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import type { EspadaReference } from '@/types/vana-espada'

export interface EspadaPin {
  playerId: string
  displayName: string
  avatarUrl: string | null
  bookId: number | null
  /** null = "Só sei o livro" → o pin cai no meio do livro. */
  chapter: number | null
}

interface Props {
  pins: EspadaPin[]
  answer: EspadaReference
  /** Mostra os pins (ativa a animação de queda). */
  revealed?: boolean
}

/**
 * A Bíblia inteira numa barra: 66 livros com largura proporcional ao número de
 * capítulos, Antigo e Novo Testamento em linhas separadas e cores por secção.
 *
 * Os avatares caem como pins no sítio onde cada um apostou e uma estrela dourada
 * marca a resposta certa. É o momento alto da revelação, por isso a queda é
 * escalonada (40 ms entre pins) em vez de tudo aparecer de uma vez.
 */
export function BibleBar({ pins, answer, revealed = true }: Props) {
  const answerBook = getBook(answer.bookId)

  return (
    <div className="w-full space-y-6">
      <TestamentRow
        label="Antigo Testamento"
        books={OLD_TESTAMENT}
        pins={pins}
        answer={answer}
        showAnswer={answerBook?.testament === 'old'}
        revealed={revealed}
        pinOffset={0}
      />
      <TestamentRow
        label="Novo Testamento"
        books={NEW_TESTAMENT}
        pins={pins}
        answer={answer}
        showAnswer={answerBook?.testament === 'new'}
        revealed={revealed}
        pinOffset={pins.length}
      />
    </div>
  )
}

function TestamentRow({
  label,
  books,
  pins,
  answer,
  showAnswer,
  revealed,
  pinOffset,
}: {
  label: string
  books: BibleBook[]
  pins: EspadaPin[]
  answer: EspadaReference
  showAnswer: boolean
  revealed: boolean
  pinOffset: number
}) {
  const total = books.reduce((sum, b) => sum + b.chapters, 0)

  // Posição de cada livro na linha, em percentagem da largura.
  const segments: { book: BibleBook; startPct: number; widthPct: number }[] = []
  let acc = 0
  for (const book of books) {
    segments.push({
      book,
      startPct: (acc / total) * 100,
      widthPct: (book.chapters / total) * 100,
    })
    acc += book.chapters
  }

  const positionOf = (bookId: number, chapter: number | null): number | null => {
    const seg = segments.find((s) => s.book.id === bookId)
    if (!seg) return null
    const ratio = chapter == null ? 0.5 : (chapter - 0.5) / seg.book.chapters
    return seg.startPct + ratio * seg.widthPct
  }

  const placed = pins
    .map((pin, i) => {
      if (pin.bookId == null) return null
      const x = positionOf(pin.bookId, pin.chapter)
      return x == null ? null : { pin, x, order: i }
    })
    .filter(Boolean) as { pin: EspadaPin; x: number; order: number }[]

  // Pins muito próximos empilham-se em vez de se sobreporem.
  const lanes = new Map<number, number>()
  const stacked: { pin: EspadaPin; x: number; order: number; lane: number }[] = []
  for (const item of [...placed].sort((a, b) => a.x - b.x)) {
    const bucket = Math.round(item.x / 2.5)
    const lane = lanes.get(bucket) ?? 0
    lanes.set(bucket, lane + 1)
    stacked.push({ ...item, lane })
  }

  const maxLane = stacked.reduce((m, s) => Math.max(m, s.lane), 0)
  const answerX = showAnswer ? positionOf(answer.bookId, answer.chapter) : null

  return (
    <div>
      <p className="text-white/40 text-[0.7rem] font-black uppercase tracking-[0.2em] mb-1">{label}</p>

      {/* Zona dos pins, por cima da barra */}
      <div
        className="relative w-full"
        style={{ height: `${2.75 + maxLane * 2.1}rem` }}
      >
        {revealed &&
          stacked.map(({ pin, x, lane, order }) => (
            <div
              key={pin.playerId}
              className="absolute -translate-x-1/2 flex flex-col items-center espada-pin"
              style={{
                left: `${x}%`,
                bottom: `${lane * 2.1}rem`,
                animationDelay: `${Math.min(order + pinOffset, 60) * 40}ms`,
              }}
            >
              <PlayerAvatar
                name={pin.displayName}
                avatarUrl={pin.avatarUrl}
                className="w-8 h-8 ring-2 ring-white/80 shadow-lg"
                textClassName="text-xs"
                fallbackBg="bg-slate-700"
              />
              <span className="w-px h-2 bg-white/50" />
            </div>
          ))}

        {/* Estrela da resposta certa */}
        {answerX != null && revealed && (
          <div
            className="absolute -translate-x-1/2 bottom-0 flex flex-col items-center espada-star"
            style={{ left: `${answerX}%` }}
          >
            <span className="text-3xl leading-none drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]">⭐</span>
            <span className="w-0.5 h-2 bg-amber-300" />
          </div>
        )}
      </div>

      {/* A barra */}
      <div className="relative w-full h-9 rounded-lg overflow-hidden flex ring-1 ring-white/20">
        {segments.map(({ book, widthPct }) => (
          <div
            key={book.id}
            className={`${SECTION_COLORS[book.section].bg} h-full flex items-center justify-center border-r border-black/20 last:border-r-0`}
            style={{ width: `${widthPct}%` }}
            title={book.name}
          >
            {widthPct > 2.2 && (
              <span className="text-white/90 text-[0.6rem] font-black leading-none truncate px-0.5">
                {book.abbr}
              </span>
            )}
          </div>
        ))}

        {answerX != null && revealed && (
          <span
            className="absolute inset-y-0 w-1 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)]"
            style={{ left: `${answerX}%`, transform: 'translateX(-50%)' }}
          />
        )}
      </div>

      <style jsx>{`
        @keyframes espadaDrop {
          0% { transform: translate(-50%, -60px); opacity: 0; }
          70% { transform: translate(-50%, 4px); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes espadaStar {
          0% { transform: translate(-50%, 0) scale(0); opacity: 0; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        .espada-pin {
          animation: espadaDrop 0.55s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
        .espada-star {
          animation: espadaStar 0.5s ease-out 0.35s both;
        }
      `}</style>
    </div>
  )
}
