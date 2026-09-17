'use client'

import {
  NEW_TESTAMENT,
  OLD_TESTAMENT,
  SECTION_COLORS,
  SECTION_LABELS,
  getBook,
  type BibleBook,
  type BibleSection,
} from '@/utils/bible-books'
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

// Medidas pensadas para um projetor a encher um salão, não para um portátil:
// a barra tem de se ler do fundo da sala.
const BAR_HEIGHT = '4.5rem'
const LANE_HEIGHT = 4.25 // rem por fila de pins empilhados
const PIN_BASE = 3.25    // rem de altura da primeira fila (avatar + haste)

/**
 * A Bíblia inteira numa barra: 66 livros com largura proporcional ao número de
 * capítulos, Antigo e Novo Testamento em linhas separadas e cores por secção.
 *
 * Os avatares caem como pins no sítio onde cada um apostou e uma coluna dourada
 * marca a resposta certa. É o momento alto da revelação, por isso a queda é
 * escalonada (40 ms entre pins) em vez de tudo aparecer de uma vez.
 *
 * Cada testamento ocupa a largura toda (em vez de partilharem uma escala comum):
 * senão o Novo Testamento, com 260 capítulos contra 929, ficava uma tira
 * ilegível no canto.
 */
export function BibleBar({ pins, answer, revealed = true }: Props) {
  const answerBook = getBook(answer.bookId)
  const oldPins = pins.filter((p) => getBook(p.bookId ?? undefined)?.testament === 'old')

  return (
    <div className="w-full space-y-8">
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
        // Continua a contagem do stagger, para os pins do NT caírem a seguir aos do AT.
        pinOffset={oldPins.length}
      />
      <SectionLegend />
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
  const answerBook = getBook(answer.bookId)

  return (
    <div>
      <p className="text-white/45 text-base font-black uppercase tracking-[0.25em] mb-2">{label}</p>

      {/* A zona dos pins e a barra partilham o mesmo sistema de coordenadas.
          O padding lateral dá folga para um avatar em Génesis ou Apocalipse não
          ficar cortado na berma do ecrã. */}
      <div className="relative px-8">
        <div
          className="relative w-full"
          style={{ height: `${PIN_BASE + maxLane * LANE_HEIGHT}rem` }}
        >
          {revealed &&
            stacked.map(({ pin, x, lane, order }) => (
              <div
                key={pin.playerId}
                className="absolute flex flex-col items-center espada-pin"
                style={{
                  left: `${x}%`,
                  bottom: `${lane * LANE_HEIGHT}rem`,
                  animationDelay: `${Math.min(order + pinOffset, 60) * 40}ms`,
                }}
              >
                <PlayerAvatar
                  name={pin.displayName}
                  avatarUrl={pin.avatarUrl}
                  className="w-14 h-14 ring-4 ring-white/85 shadow-[0_6px_16px_rgba(0,0,0,0.55)]"
                  textClassName="text-xl"
                  fallbackBg="bg-slate-700"
                />
                <span className="w-0.5 h-3 bg-white/60" />
              </div>
            ))}

          {/* Marcador da resposta certa */}
          {answerX != null && revealed && (
            <div
              className="absolute bottom-0 flex flex-col items-center espada-star"
              style={{ left: `${answerX}%` }}
            >
              <span className="text-5xl leading-none drop-shadow-[0_0_18px_rgba(251,191,36,0.95)]">⭐</span>
              <span className="w-1 h-3 bg-amber-300" />
            </div>
          )}
        </div>

        {/* A barra */}
        <div
          className="relative w-full rounded-xl overflow-hidden flex ring-2 ring-white/25 shadow-2xl"
          style={{ height: BAR_HEIGHT }}
        >
          {segments.map(({ book, widthPct }) => (
            <div
              key={book.id}
              className={`${SECTION_COLORS[book.section].bg} h-full flex items-center justify-center border-r border-black/25 last:border-r-0`}
              style={{ width: `${widthPct}%` }}
              title={book.name}
            >
              {/* Abaixo de ~1,5% da largura não cabe texto legível — fica só a cor,
                  e a legenda por baixo explica a que secção pertence. */}
              {widthPct > 1.5 && (
                <span className="text-white text-base font-black leading-none truncate px-1 drop-shadow">
                  {book.abbr}
                </span>
              )}
            </div>
          ))}

          {answerX != null && revealed && (
            <span
              className="absolute inset-y-0 w-1.5 bg-amber-300 shadow-[0_0_20px_rgba(251,191,36,1)]"
              style={{ left: `${answerX}%`, transform: 'translateX(-50%)' }}
            />
          )}
        </div>

        {/* Nome do livro certo, por baixo da coluna dourada.
            Vai num wrapper próprio com a largura da barra: uma percentagem num
            elemento absoluto conta a partir da caixa de padding do antepassado,
            e o `px-8` acima desalinhava-a da barra. */}
        {answerX != null && revealed && answerBook && (
          <div className="relative w-full h-10 mt-2.5">
            <div className="absolute espada-answer-label" style={{ left: `${answerX}%` }}>
              <span className="inline-block bg-amber-300 text-slate-900 font-black text-xl px-4 py-1 rounded-lg shadow-lg whitespace-nowrap">
                {answerBook.name} {answer.chapter}
              </span>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes espadaDrop {
          0% { transform: translate(-50%, -90px); opacity: 0; }
          70% { transform: translate(-50%, 6px); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes espadaStar {
          0% { transform: translate(-50%, 0) scale(0); opacity: 0; }
          60% { transform: translate(-50%, 0) scale(1.35); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes espadaLabel {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .espada-pin {
          animation: espadaDrop 0.55s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
        .espada-star {
          animation: espadaStar 0.6s ease-out 0.35s both;
        }
        .espada-answer-label {
          animation: espadaLabel 0.4s ease-out 0.7s both;
        }
      `}</style>
    </div>
  )
}

/**
 * Legenda das secções. É o que dá sentido à mancha de fatias estreitas dos
 * profetas menores e das cartas curtas, onde não cabe o nome de cada livro.
 */
function SectionLegend() {
  const sections: BibleSection[] = [
    'law', 'history', 'poetry', 'major_prophets', 'minor_prophets',
    'gospels', 'acts', 'pauline', 'general', 'apocalyptic',
  ]

  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-1">
      {sections.map((s) => (
        <span key={s} className="flex items-center gap-2 text-white/55 text-sm font-bold uppercase tracking-wider">
          <span className={`w-3.5 h-3.5 rounded ${SECTION_COLORS[s].bg}`} />
          {SECTION_LABELS[s]}
        </span>
      ))}
    </div>
  )
}
