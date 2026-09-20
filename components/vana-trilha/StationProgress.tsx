import { Award, Check } from 'lucide-react'
import { STATION_THEME } from '@/utils/vana-trilha-labels'
import { VANATRILHA_BADGE_NAME, VANATRILHA_STATIONS } from '@/types/vana-trilha'

interface Props {
  completed: number[]
  badgeUnlocked: boolean
  todayStation?: number
}

export default function StationProgress({ completed, badgeUnlocked, todayStation }: Props) {
  const done = new Set(completed)
  const count = VANATRILHA_STATIONS.filter((s) => done.has(s.id)).length

  return (
    <div className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">A tua viagem</p>
          <p className="font-black text-slate-900">
            {count} de {VANATRILHA_STATIONS.length} estações completadas
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            badgeUnlocked ? 'bg-gradient-to-r from-yellow-300 to-amber-500 text-amber-950 shadow' : 'bg-slate-100 text-slate-400'
          }`}
          title={badgeUnlocked ? 'Insígnia desbloqueada!' : 'Completa as 7 estações para desbloquear'}
        >
          <Award className="h-4 w-4" />
          <span className="hidden sm:inline">{VANATRILHA_BADGE_NAME}</span>
          <span className="sm:hidden">Insígnia</span>
        </div>
      </div>

      <ol className="grid grid-cols-7 gap-1">
        {VANATRILHA_STATIONS.map((s) => {
          const isDone = done.has(s.id)
          const isToday = s.id === todayStation
          const theme = STATION_THEME[s.color]
          return (
            <li key={s.id} className="flex flex-col items-center gap-1 text-center">
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black sm:h-11 sm:w-11 ${
                  isDone ? `${theme.bg} border-white text-white shadow` : 'border-slate-200 bg-slate-50 text-slate-400'
                } ${isToday ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
                title={`${s.name}${isDone ? ' — completada' : ''}${isToday ? ' (hoje)' : ''}`}
              >
                {isDone ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <span className={`text-[9px] font-semibold leading-tight sm:text-[11px] ${isDone ? 'text-slate-700' : 'text-slate-400'}`}>
                {s.name}
              </span>
            </li>
          )
        })}
      </ol>

      {!badgeUnlocked && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Completa as 7 estações (não precisam de ser dias seguidos) para ganhares a insígnia{' '}
          <strong>{VANATRILHA_BADGE_NAME}</strong>.
        </p>
      )}
    </div>
  )
}
