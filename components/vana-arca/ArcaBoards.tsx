'use client'

import { useEffect, useState } from 'react'
import { Clock, Home, Trophy, Users } from 'lucide-react'
import type { VanaArcaBoards } from '@/types/vana-arca'
import { formatAverage, ordinal } from '@/utils/vana-arca'

/** "2 d 4 h", "3 h 12 min", "8 min", "a processar…" */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'a processar…'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${Math.max(1, m)} min`
}

export function prizeDateLabel(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** null até montar (o servidor e o browser não têm o mesmo "agora"). */
function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [intervalMs])
  return now
}

const MEDAL = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-950']

export default function ArcaBoards({ boards }: { boards: VanaArcaBoards }) {
  const [tab, setTab] = useState<'top' | 'familias'>('top')
  const now = useNow(30_000)
  const left = now === null ? null : new Date(boards.period.end).getTime() - now

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
      <div className="grid grid-cols-2 border-b border-sky-100 text-sm font-bold" role="tablist">
        {(
          [
            ['top', 'Top da semana', Trophy],
            ['familias', 'Disputa de Famílias', Home],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-3 transition-colors ${
              tab === id ? 'bg-sky-50 text-sky-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Prémios {left !== null && <>em <span className="font-black text-sky-800">{formatCountdown(left)}</span></>}
          <span className="text-slate-400">({prizeDateLabel(boards.period.end)})</span>
        </p>

        {tab === 'top' ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {boards.prizes.slice(0, 3).map((p, i) => (
                <div key={i} className="rounded-xl bg-amber-50 px-2 py-2 ring-1 ring-amber-100">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">{ordinal(i + 1)} lugar</p>
                  <p className="text-sm font-extrabold text-amber-950">{p} XP + {p} Gold</p>
                </div>
              ))}
            </div>
            {boards.top.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Ainda ninguém jogou esta semana. Sê o primeiro!</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {[...boards.top, ...(boards.me ? [boards.me] : [])].map((r) => (
                  <li
                    key={`${r.position}-${r.name}`}
                    className={`flex items-center gap-3 px-2 py-2 ${r.is_me ? 'rounded-xl bg-sky-50 font-bold' : ''}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                        MEDAL[r.position - 1] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                      {r.name}
                      {r.is_me && <span className="ml-1 text-xs font-semibold text-sky-700">(tu)</span>}
                    </span>
                    <span className="text-sm font-black tabular-nums text-slate-900">{r.score}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-[11px] text-slate-400">
              Conta a tua melhor partida da semana. Em caso de empate ganha quem fez a pontuação primeiro.
            </p>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
              A família com a melhor média ganha {boards.family_prize} XP + {boards.family_prize} Gold para cada membro que jogou.
            </p>
            {boards.family_note && <p className="text-sm font-bold text-sky-900">{boards.family_note}</p>}
            {boards.families.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Nenhuma família tem ainda {boards.family_min_members} membros ativos.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {boards.families.map((f) => (
                  <li
                    key={`${f.position}-${f.name}`}
                    className={`flex items-center gap-3 px-2 py-2 ${f.is_mine ? 'rounded-xl bg-sky-50' : ''}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                        f.position === 1 ? MEDAL[0] : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {f.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm text-slate-800 ${f.is_mine ? 'font-bold' : ''}`}>
                        {f.name}
                        {f.is_mine && <span className="ml-1 text-xs font-semibold text-sky-700">(a tua)</span>}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Users className="h-3 w-3" /> {f.played} de {f.active} jogaram
                      </p>
                    </div>
                    <span className="text-right">
                      <span className="block text-sm font-black tabular-nums text-slate-900">{formatAverage(f.average)}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400">média</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-[11px] text-slate-400">
              Média = soma dos recordes da semana ÷ membros ativos (quem não jogou conta 0). Só entram famílias com pelo
              menos {boards.family_min_members} membros ativos.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
