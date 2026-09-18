'use client'

import { SECTION_COLORS, getBook } from '@/utils/bible-books'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { formatReference } from '@/utils/vana-espada'
import type { EspadaReference } from '@/types/vana-espada'
import { labelShift, type EspadaPin } from './BibleBar'

interface Props {
  pins: EspadaPin[]
  answer: EspadaReference
}

// Mesma escala da BibleBar: é o mesmo projetor, lido do fundo do mesmo salão.
const BAR_HEIGHT = '4.5rem'
const LANE_HEIGHT = 3.75
const PIN_BASE = 3.25
const MAX_LANES = 3

/**
 * Zoom no livro certo: os capítulos todos em linha, com o avatar de quem acertou
 * o livro no capítulo que escolheu. Quem só disse o livro fica numa fila à parte —
 * não escolheu nenhum capítulo.
 *
 * ⚠️ Posicionamento: os pins NÃO levam a classe `-translate-x-1/2`. A animação de
 * queda já acaba em `transform: translate(-50%, 0)`, e no Tailwind 4 a classe usa a
 * propriedade CSS `translate`, que se SOMA ao `transform` — o avatar recuava meia
 * largura a mais e quem acertou em cheio aparecia ao lado da faixa dourada.
 */
export function BookZoom({ pins, answer }: Props) {
  const book = getBook(answer.bookId)
  if (!book) return null

  const inBook = pins.filter((p) => p.bookId === book.id)
  const withChapter = inBook.filter((p) => p.chapter != null)
  const bookOnly = inBook.filter((p) => p.chapter == null)

  const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1)
  const cellPct = 100 / book.chapters
  // Centro exato da célula do capítulo — é a mesma conta para os pins e para a faixa
  // dourada, por isso quem acerta fica mesmo por cima dela.
  const positionOf = (chapter: number) => (chapter - 0.5) * cellPct

  // Empilha quem escolheu o mesmo capítulo (ou um muito próximo), com tecto.
  const lanes = new Map<number, number>()
  const stacked: { pin: EspadaPin; x: number; lane: number; order: number }[] = []
  const overflow = new Map<number, { x: number; count: number }>()
  const ordered = [...withChapter].sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0))

  for (let i = 0; i < ordered.length; i++) {
    const pin = ordered[i]
    const x = positionOf(pin.chapter as number)
    // Num livro pequeno cada capítulo é o seu próprio grupo; num livro grande
    // (Salmos) juntam-se capítulos vizinhos para os avatares não se atropelarem.
    const bucket = cellPct >= 3 ? (pin.chapter as number) : Math.round(x / 3)
    const lane = lanes.get(bucket) ?? 0
    lanes.set(bucket, lane + 1)

    if (lane < MAX_LANES) {
      stacked.push({ pin, x, lane, order: i })
    } else {
      const current = overflow.get(bucket)
      overflow.set(bucket, { x: current?.x ?? x, count: (current?.count ?? 0) + 1 })
    }
  }

  const maxLane = Math.max(
    stacked.reduce((m, s) => Math.max(m, s.lane), 0),
    overflow.size > 0 ? MAX_LANES : 0
  )
  const answerX = positionOf(answer.chapter)

  // Com muitos capítulos não cabe o número em todas as células: mostram-se o 1 e
  // as dezenas, que chegam para se perceber a escala (ex.: Salmos 1, 10, 20…).
  // Na faixa dourada estreita não se escreve nada: o número escuro transbordava
  // para o verde dos vizinhos, e a etiqueta por baixo já diz a referência.
  const wideCells = cellPct > 1.6
  const showNumber = (n: number) =>
    n === answer.chapter ? wideCells : wideCells || n === 1 || n % 10 === 0

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-3 px-8">
        <p className="text-white font-black text-4xl">{book.name}</p>
        <p className="text-white/45 font-bold text-xl">
          {book.chapters} capítulo{book.chapters === 1 ? '' : 's'}
        </p>
      </div>

      <div className="relative px-8">
        {/* Pins */}
        <div className="relative w-full" style={{ height: `${PIN_BASE + maxLane * LANE_HEIGHT}rem` }}>
          {stacked.map(({ pin, x, lane, order }) => (
            <div
              key={pin.playerId}
              className="absolute flex flex-col items-center espada-zoom-pin"
              style={{
                left: `${x}%`,
                bottom: `${lane * LANE_HEIGHT}rem`,
                animationDelay: `${Math.min(order, 60) * 40}ms`,
              }}
            >
              <PlayerAvatar
                name={pin.displayName}
                avatarUrl={pin.avatarUrl}
                className="w-12 h-12 ring-4 ring-white/85 shadow-[0_6px_16px_rgba(0,0,0,0.55)]"
                textClassName="text-lg"
                fallbackBg="bg-slate-700"
              />
              <span className="w-0.5 h-3 bg-white/60" />
            </div>
          ))}

          {[...overflow.entries()].map(([bucket, { x, count }]) => (
            <div
              key={`mais-${bucket}`}
              className="absolute espada-zoom-pin"
              style={{ left: `${x}%`, bottom: `${MAX_LANES * LANE_HEIGHT}rem`, animationDelay: '600ms' }}
            >
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-white/15 border-2 border-white/40 text-white font-black text-lg shadow-lg">
                +{count}
              </span>
            </div>
          ))}
        </div>

        {/* Os capítulos */}
        <div
          className="relative w-full rounded-xl overflow-hidden flex ring-2 ring-white/25 shadow-2xl"
          style={{ height: BAR_HEIGHT }}
        >
          {chapters.map((n) => {
            const isAnswer = n === answer.chapter
            return (
              <div
                key={n}
                className={`h-full flex items-center justify-center border-r border-black/20 last:border-r-0 ${
                  isAnswer ? 'bg-amber-300 shadow-[0_0_24px_rgba(251,191,36,1)] z-10' : SECTION_COLORS[book.section].bg
                }`}
                style={{ width: `${cellPct}%` }}
              >
                {showNumber(n) && (
                  <span
                    className={`font-black leading-none whitespace-nowrap ${
                      isAnswer ? 'text-slate-900 text-lg' : 'text-white/85 text-sm'
                    }`}
                  >
                    {n}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* A referência certa, por baixo do capítulo dourado */}
        <div className="relative w-full h-10 mt-2.5">
          <div
            className="absolute espada-zoom-label"
            style={{ left: `${answerX}%`, transform: `translateX(${labelShift(answerX)})` }}
          >
            <span className="inline-block bg-amber-300 text-slate-900 font-black text-xl px-4 py-1 rounded-lg shadow-lg whitespace-nowrap">
              {formatReference(answer)}
            </span>
          </div>
        </div>
      </div>

      {bookOnly.length > 0 && (
        <div className="flex items-center gap-3 mt-6 flex-wrap px-8">
          <span className="text-white/50 text-base font-black uppercase tracking-widest">
            Acertaram o livro:
          </span>
          {bookOnly.map((pin) => (
            <div key={pin.playerId} className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-4 py-1.5">
              <PlayerAvatar
                name={pin.displayName}
                avatarUrl={pin.avatarUrl}
                className="w-9 h-9"
                textClassName="text-sm"
                fallbackBg="bg-slate-700"
              />
              <span className="text-white font-bold text-lg">{pin.displayName}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes espadaZoomDrop {
          0% { transform: translate(-50%, -80px); opacity: 0; }
          70% { transform: translate(-50%, 6px); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes espadaZoomLabel {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .espada-zoom-pin {
          animation: espadaZoomDrop 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
        .espada-zoom-label {
          animation: espadaZoomLabel 0.4s ease-out 0.5s both;
        }
      `}</style>
    </div>
  )
}
