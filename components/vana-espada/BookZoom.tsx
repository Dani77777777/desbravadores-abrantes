'use client'

import { SECTION_COLORS, getBook } from '@/utils/bible-books'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { formatReference } from '@/utils/vana-espada'
import type { EspadaReference } from '@/types/vana-espada'
import type { EspadaPin } from './BibleBar'

interface Props {
  pins: EspadaPin[]
  answer: EspadaReference
}

/**
 * Zoom no livro certo: os capítulos todos em linha, com os pins de quem acertou o
 * livro distribuídos pelo capítulo que escolheu. Quem só disse o livro fica numa
 * fila à parte — não apostou em nenhum capítulo.
 */
export function BookZoom({ pins, answer }: Props) {
  const book = getBook(answer.bookId)
  if (!book) return null

  const inBook = pins.filter((p) => p.bookId === book.id)
  const withChapter = inBook.filter((p) => p.chapter != null)
  const bookOnly = inBook.filter((p) => p.chapter == null)

  const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1)
  const positionOf = (chapter: number) => ((chapter - 0.5) / book.chapters) * 100

  // Empilha os pins que calham no mesmo sítio.
  const lanes = new Map<number, number>()
  const stacked: { pin: EspadaPin; x: number; lane: number; order: number }[] = []
  const ordered = [...withChapter].sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0))
  for (let i = 0; i < ordered.length; i++) {
    const pin = ordered[i]
    const x = positionOf(pin.chapter as number)
    const bucket = Math.round(x / 3)
    const lane = lanes.get(bucket) ?? 0
    lanes.set(bucket, lane + 1)
    stacked.push({ pin, x, lane, order: i })
  }

  const maxLane = stacked.reduce((m, s) => Math.max(m, s.lane), 0)

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-white font-black text-2xl">{book.name}</p>
        <p className="text-amber-300 font-black text-xl tabular-nums">{formatReference(answer)}</p>
      </div>

      <div className="relative w-full" style={{ height: `${2.75 + maxLane * 2.1}rem` }}>
        {stacked.map(({ pin, x, lane, order }) => (
          <div
            key={pin.playerId}
            className="absolute -translate-x-1/2 flex flex-col items-center espada-zoom-pin"
            style={{ left: `${x}%`, bottom: `${lane * 2.1}rem`, animationDelay: `${Math.min(order, 60) * 40}ms` }}
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
      </div>

      <div className="relative w-full h-10 rounded-lg overflow-hidden flex ring-1 ring-white/20">
        {chapters.map((n) => {
          const isAnswer = n === answer.chapter
          return (
            <div
              key={n}
              className={`h-full flex items-center justify-center border-r border-black/20 last:border-r-0 ${
                isAnswer ? 'bg-amber-300' : SECTION_COLORS[book.section].bg
              }`}
              style={{ width: `${100 / book.chapters}%` }}
            >
              {100 / book.chapters > 2.5 && (
                <span
                  className={`text-[0.65rem] font-black leading-none ${
                    isAnswer ? 'text-slate-900' : 'text-white/85'
                  }`}
                >
                  {n}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {bookOnly.length > 0 && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-white/50 text-xs font-bold uppercase tracking-widest">
            Acertaram o livro:
          </span>
          {bookOnly.map((pin) => (
            <div key={pin.playerId} className="flex items-center gap-1.5 bg-white/10 rounded-full pl-1 pr-3 py-1">
              <PlayerAvatar
                name={pin.displayName}
                avatarUrl={pin.avatarUrl}
                className="w-6 h-6"
                textClassName="text-[0.6rem]"
                fallbackBg="bg-slate-700"
              />
              <span className="text-white font-bold text-sm">{pin.displayName}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes espadaZoomDrop {
          0% { transform: translate(-50%, -50px); opacity: 0; }
          70% { transform: translate(-50%, 4px); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .espada-zoom-pin {
          animation: espadaZoomDrop 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
      `}</style>
    </div>
  )
}
