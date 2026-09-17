// TEMPORÁRIO — página de desenvolvimento para ver a BibleBar sem uma sessão a sério.
// Apagar depois de conferir o visual.
'use client'

import { BibleBar, type EspadaPin } from '@/components/vana-espada/BibleBar'

const NAMES = [
  'Daniel P', 'Maria S', 'João C', 'Ana R', 'Tiago M', 'Sofia L', 'Pedro A', 'Rita F',
  'Miguel T', 'Inês B', 'Bruno V', 'Carla N', 'Hugo D', 'Beatriz G', 'Nuno E', 'Sara Q',
  'Rui Z', 'Marta H', 'Vasco I', 'Clara J', 'Tomás K', 'Luísa O', 'André U', 'Eva W',
]

// Palpites espalhados por toda a Bíblia, alguns em cima uns dos outros.
const GUESSES: [number, number | null][] = [
  [19, 23], [19, 23], [19, 24], [19, 22], [19, null],
  [20, 3], [20, 4], [18, 1], [21, 12], [22, 2],
  [1, 1], [2, 20], [5, 6], [6, 1], [9, 17],
  [23, 40], [24, 29], [27, 6], [33, 6], [39, 3],
  [40, 5], [43, 3], [45, 8], [66, 14],
]

export default function DevEspadaBarPage() {
  const pins: EspadaPin[] = GUESSES.map(([bookId, chapter], i) => ({
    playerId: `p${i}`,
    displayName: NAMES[i % NAMES.length],
    avatarUrl: null,
    bookId,
    chapter,
  }))

  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex items-center justify-center p-10">
      <div className="w-full h-full flex flex-col justify-center gap-7">
        <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-3xl text-center">
          Onde apostou cada um
        </p>
        <BibleBar pins={pins} answer={{ bookId: 19, chapter: 23, verseStart: 1, verseEnd: 1 }} />
      </div>
    </div>
  )
}
