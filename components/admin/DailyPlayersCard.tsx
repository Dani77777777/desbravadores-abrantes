import { Users } from 'lucide-react'

export function DailyPlayersCard({
  date,
  players,
  accent = 'blue',
}: {
  date: string
  players: number
  accent?: 'blue' | 'emerald'
}) {
  const styles = accent === 'emerald'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : 'border-blue-100 bg-blue-50 text-blue-700'

  return (
    <section className={`rounded-3xl border p-5 ${styles}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">Jogadores hoje</p>
          <p className="text-sm font-medium opacity-80">{date.split('-').reverse().join('/')}</p>
        </div>
      </div>
      <p className="mt-4 text-4xl font-black">{players}</p>
      <p className="text-sm font-semibold opacity-80">{players === 1 ? 'pessoa jogou' : 'pessoas jogaram'}</p>
    </section>
  )
}
