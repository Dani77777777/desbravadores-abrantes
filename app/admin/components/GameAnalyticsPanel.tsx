'use client'

import { useState } from 'react'
import { Activity, CalendarDays, Clock, Database, Lightbulb, Medal, Minus, Repeat, TrendingDown, TrendingUp, UserPlus, Users } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'
import { getGame } from '@/utils/games'
import {
  ANALYTICS_PERIODS,
  GAME_METRICS,
  changePercent,
  type AnalyticsPeriod,
  type GameAnalytics,
  type GameStats,
  type SingleplayerGameId,
} from '@/utils/game-analytics'

const D = displayFont.className

// Cor fixa por jogo (paleta categórica validada, 4 primeiras posições) — nunca muda com filtros.
const GAME_COLOR: Record<SingleplayerGameId, string> = {
  'vana-trilha': '#2a78d6',
  vantur: '#eb6834',
  'vana-codigo': '#1baf7a',
  'vana-sentinela': '#8d4fd8',
}
const TOTAL_COLOR = '#57534e'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const dec = (x: number | null) => (x === null ? '—' : x.toFixed(1).replace('.', ','))
const title = (id: SingleplayerGameId) => getGame(id)?.title ?? id

function dayLabel(iso: string, compact = false) {
  const d = new Date(`${iso}T12:00:00Z`)
  if (compact) return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
  const wd = d.toLocaleDateString('pt-PT', { weekday: 'long', timeZone: 'UTC' }).slice(0, 3)
  return `${wd} ${d.getUTCDate()}`
}

/** "semana anterior" / "30 dias anteriores" */
const prevLabel = (period: number) => (period === 7 ? 'semana anterior' : `${period} dias anteriores`)

/** Variação vs. período anterior: ícone + texto (nunca só cor). */
function Delta({ current, previous, period }: { current: number; previous: number; period: number }) {
  const change = changePercent(current, previous)
  if (change === null) {
    return current > 0
      ? <span className="text-[11px] font-bold text-stone-500">novo neste período</span>
      : <span className="text-[11px] text-stone-400">sem dados antes</span>
  }
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const tone = change > 0 ? 'text-emerald-700' : change < 0 ? 'text-red-600' : 'text-stone-500'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${tone}`} title={`${prevLabel(period)}: ${previous}`}>
      <Icon className="h-3.5 w-3.5" />
      {change > 0 ? '+' : ''}{change}% vs. {prevLabel(period)}
    </span>
  )
}

function StatTile({ icon: Icon, label, value, sub, delta }: {
  icon: typeof Users; label: string; value: string; sub?: string; delta?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`${D} mt-1 text-3xl font-extrabold tabular-nums text-blue-950`}>{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
      {delta && <div className="mt-1.5">{delta}</div>}
    </div>
  )
}

// ─── Gráfico de linhas: jogadores por dia, por jogo + total ──────────────────

function PlayersLineChart({ analytics }: { analytics: GameAnalytics }) {
  const [hover, setHover] = useState<number | null>(null)
  const { days, games, daily } = analytics
  const many = days.length > 10
  const W = 700, H = 240, L = 34, R = 16, T = 14, B = 30
  const max = Math.max(4, ...daily)
  const step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const colW = (W - L - R) / (days.length - 1)
  const x = (i: number) => L + i * colW
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const last = days.length - 1
  // Em 30 dias, etiqueta de 5 em 5 (contando do fim, para hoje ter sempre a sua)
  const showLabel = (i: number) => !many || (last - i) % 5 === 0
  const points = (vs: number[]) => vs.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Jogadores por dia em cada jogo, nos últimos ${days.length} dias`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#78716c">{t}</text>
          </g>
        ))}
        {days.map((d, i) =>
          showLabel(i) || hover === i ? (
            <text
              key={d}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
              fontSize={11}
              fill={hover === i ? '#172554' : '#78716c'}
              fontWeight={hover === i ? 700 : 400}
            >
              {dayLabel(d, many)}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#a8a29e" strokeWidth={1} />}

        {/* Total: pessoas diferentes nesse dia (em qualquer jogo) */}
        <polyline points={points(daily)} fill="none" stroke={TOTAL_COLOR} strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" />
        {games.map((g) => (
          <polyline
            key={g.gameId}
            points={points(g.daily)}
            fill="none"
            stroke={GAME_COLOR[g.gameId]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null &&
          games.map((g) => (
            <circle key={g.gameId} cx={x(hover)} cy={y(g.daily[hover])} r={4.5} fill={GAME_COLOR[g.gameId]} stroke="#fff" strokeWidth={2} />
          ))}

        {/* Zonas de hover (uma por dia, maiores do que as marcas) */}
        {days.map((d, i) => (
          <rect
            key={d}
            x={x(i) - colW / 2}
            y={0}
            width={colW}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-xl border border-stone-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > days.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <p className="mb-1.5 font-bold capitalize text-blue-950">{dayLabel(days[hover])}</p>
          {games.map((g) => (
            <p key={g.gameId} className="flex items-center justify-between gap-4 py-0.5 text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: GAME_COLOR[g.gameId] }} />
                {title(g.gameId)}
              </span>
              <b className="tabular-nums text-stone-900">{g.daily[hover]}</b>
            </p>
          ))}
          <p className="mt-1.5 flex justify-between gap-4 border-t border-stone-100 pt-1.5 text-stone-600">
            Pessoas diferentes <b className="tabular-nums text-stone-900">{daily[hover]}</b>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Por jogo ─────────────────────────────────────────────────────────────────

function ModeBar({ mode, gameId }: { mode: GameStats['modes'][number]; gameId: SingleplayerGameId }) {
  const color = GAME_COLOR[gameId]
  const metrics = GAME_METRICS[gameId]
  const lost = mode.finished - mode.won
  const open = mode.plays - mode.finished
  const segments = [
    { n: mode.won, bg: color, label: metrics.outcomeLabels[0] },
    { n: lost, bg: color, opacity: 0.4, label: metrics.outcomeLabels[1] },
    { n: open, bg: '#d6d3d1', label: 'ficou a meio' },
  ].filter((s) => s.n > 0)

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-stone-700">{mode.label}</span>
        <span className="tabular-nums text-stone-500">
          {mode.plays} {mode.plays === 1 ? 'partida' : 'partidas'}
          {mode.avgAttempts !== null && ` · ${dec(mode.avgAttempts)} ${metrics.attemptsLabel}`}
        </span>
      </div>
      {mode.plays === 0 ? (
        <div className="h-3 rounded-full bg-stone-100" title="Ninguém jogou este modo" />
      ) : (
        <div className="flex h-3 gap-[2px]">
          {segments.map((s, i) => (
            <div
              key={s.label}
              title={`${s.n} ${s.label}`}
              className={`h-full ${i === 0 ? 'rounded-l-full' : ''} ${i === segments.length - 1 ? 'rounded-r-full' : ''}`}
              style={{ flexGrow: s.n, background: s.bg, opacity: s.opacity ?? 1 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function GameCard({ stats, period, guestRounds }: { stats: GameStats; period: number; guestRounds: number | null }) {
  const game = getGame(stats.gameId)
  const color = GAME_COLOR[stats.gameId]
  const metrics = GAME_METRICS[stats.gameId]
  const { week, previous } = stats

  const tiles = [
    { v: String(week.players), l: week.players === 1 ? 'jogador' : 'jogadores' },
    { v: pct(week.winRate), l: metrics.winLabel },
    metrics.canAbandon
      ? { v: pct(week.completionRate), l: 'acabadas' }
      : { v: String(stats.attemptsTotal), l: stats.attemptsTotal === 1 ? 'ronda' : 'rondas' },
  ]

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="h-1.5" style={{ background: color }} />
      <div className="flex items-center gap-3 p-4 pb-3">
        <img src={game?.image} alt="" className="h-11 w-11 rounded-xl bg-stone-50 object-contain p-1 ring-1 ring-stone-200" />
        <div className="min-w-0">
          <h4 className={`${D} truncate text-lg font-extrabold text-blue-950`}>{game?.title}</h4>
          <Delta current={week.players} previous={previous.players} period={period} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-y border-stone-100 bg-stone-100 text-center">
        {tiles.map((s) => (
          <div key={s.l} className="bg-white px-2 py-3">
            <p className={`${D} text-xl font-extrabold tabular-nums text-blue-950`}>{s.v}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-3 p-4">
        {week.plays === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">Nenhum membro jogou neste período.</p>
        ) : (
          stats.modes.map((m) => <ModeBar key={m.mode} mode={m} gameId={stats.gameId} />)
        )}
      </div>

      {guestRounds !== null && guestRounds > 0 && (
        <p className="flex items-center gap-1.5 border-t border-stone-100 px-4 py-2 text-xs font-semibold text-violet-700">
          <UserPlus className="h-3.5 w-3.5" />
          + {guestRounds} {guestRounds === 1 ? 'ronda' : 'rondas'} de convidados sem conta
        </p>
      )}
      <p className="flex items-center gap-1.5 border-t border-stone-100 bg-stone-50/70 px-4 py-2.5 text-xs text-stone-500">
        <Repeat className="h-3.5 w-3.5" />
        {week.players === 0
          ? 'Sem jogadores neste período'
          : `${week.returning} de ${week.players} voltaram noutro dia · ${dec(week.avgDaysPerPlayer)} dias por jogador`}
      </p>
    </div>
  )
}

// ─── Leitura rápida ───────────────────────────────────────────────────────────

function joinPt(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`
}

function insights(a: GameAnalytics, totalMembers: number, guestRounds: number | null): string[] {
  const out: string[] = []
  const when = a.periodDays === 7 ? 'esta semana' : `nos últimos ${a.periodDays} dias`
  if (a.week.players === 0) {
    return [`Nenhum membro jogou aos jogos a solo ${when}. Talvez valha a pena lembrar o clube num comunicado!`]
  }

  const ranked = [...a.games].sort((x, y) => y.week.players - x.week.players)
  out.push(`${title(ranked[0].gameId)} é o mais jogado: ${ranked[0].week.players} ${ranked[0].week.players === 1 ? 'pessoa' : 'pessoas'} ${when}.`)

  const empty = a.games.filter((g) => g.week.plays === 0).map((g) => title(g.gameId))
  if (empty.length) out.push(`Ninguém jogou ${joinPt(empty)} ${when}.`)

  // Modo onde mais gente desiste (pelo menos 3 partidas para ter significado)
  const quits = a.games
    .filter((g) => GAME_METRICS[g.gameId].canAbandon)
    .flatMap((g) => g.modes.map((m) => ({ g, m, rate: m.plays ? (m.plays - m.finished) / m.plays : 0 })))
    .filter((q) => q.m.plays >= 3 && q.rate >= 0.4)
    .sort((x, y) => y.rate - x.rate)[0]
  if (quits) out.push(`${Math.round(quits.rate * 100)}% deixam a partida a meio no ${title(quits.g.gameId)} (${quits.m.label}). Pode estar difícil demais.`)

  const hard = a.games
    .flatMap((g) => g.modes.map((m) => ({ g, m })))
    .filter(({ m }) => m.finished >= 3 && m.won / m.finished < 0.3)[0]
  if (hard && !quits) {
    out.push(`Só ${Math.round((hard.m.won / hard.m.finished) * 100)}% conseguem ${GAME_METRICS[hard.g.gameId].winLabel === 'vitórias' ? 'ganhar' : GAME_METRICS[hard.g.gameId].winLabel} no ${title(hard.g.gameId)} (${hard.m.label}).`)
  }

  if (guestRounds) out.push(`Convidados sem conta jogaram ${guestRounds} ${guestRounds === 1 ? 'ronda' : 'rondas'} de ${title('vana-sentinela')}.`)

  const peakDay = a.weekdays.indexOf(Math.max(...a.weekdays))
  const peakHour = a.hours.indexOf(Math.max(...a.hours))
  const peakDayPrep = peakDay === 0 || peakDay === 6 ? 'ao' : 'à'
  out.push(`Joga-se mais ${peakDayPrep} ${WEEKDAYS_LONG[peakDay]}, entre as ${peakHour}h e as ${peakHour + 1}h.`)

  if (totalMembers > 0) {
    const share = Math.round((a.week.players / totalMembers) * 100)
    if (share < 25) out.push(`Só ${share}% dos membros jogaram. Há espaço para crescer!`)
  }
  return out.slice(0, 5)
}

// ─── Barras simples (quando jogam) ───────────────────────────────────────────

function Bars({ values, labels, tip }: { values: number[]; labels: React.ReactNode; tip: (i: number, n: number) => string }) {
  const max = Math.max(1, ...values)
  return (
    <>
      <div className="mt-3 flex h-24 items-end gap-[2px]">
        {values.map((n, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-8 rounded-t bg-blue-700 transition-colors group-hover:bg-blue-900"
              style={{ height: n ? `${Math.max(4, (n / max) * 100)}%` : 0 }}
            />
            <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md bg-blue-950 px-2 py-0.5 text-[11px] font-bold text-white group-hover:block">
              {tip(i, n)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-[10px] text-stone-400">{labels}</div>
    </>
  )
}

// ─── Painel ───────────────────────────────────────────────────────────────────

export function GameAnalyticsPanel({ analytics, sentinelaGuestRounds, memberNames, totalMembers, scopeLabel }: {
  /** Por período (7/30 dias); null quando a tabela game_plays ainda não existe (migração por correr). */
  analytics: Record<AnalyticsPeriod, GameAnalytics> | null
  /** Rondas de convidados sem conta no VanaSentinela (só coordenação; null = sem acesso). */
  sentinelaGuestRounds: Record<AnalyticsPeriod, number> | null
  memberNames: Record<string, string>
  totalMembers: number
  scopeLabel: string
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(7)

  if (!analytics) {
    return (
      <div className="flex items-start gap-3 rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <Database className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">Analítica dos jogos por ativar</p>
          <p className="mt-0.5 text-amber-800/90">
            Corre o ficheiro <code className="rounded bg-amber-100 px-1">supabase-setup-game-analytics.sql</code> no SQL Editor do Supabase
            para começar a registar as partidas dos jogos a solo.
          </p>
        </div>
      </div>
    )
  }

  const a = analytics[period]
  const guestRounds = sentinelaGuestRounds?.[period] ?? null
  const share = totalMembers ? Math.round((a.week.players / totalMembers) * 100) : null

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-blue-950 p-6 text-white shadow-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(50% 80% at 100% 0%, rgba(250,204,21,.18), transparent 70%), radial-gradient(40% 70% at 0% 100%, rgba(99,102,241,.3), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-yellow-300">
              <Activity className="h-4 w-4" /> Analítica · últimos {period} dias
            </p>
            <h3 className={`${D} mt-1 text-2xl font-extrabold`}>Como vão os jogos a solo</h3>
            <p className="text-sm text-blue-100/75">
              {joinPt(a.games.map((g) => title(g.gameId)))} · {scopeLabel}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div role="tablist" aria-label="Período" className="flex rounded-full bg-white/10 p-1">
              {ANALYTICS_PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                    period === p ? 'bg-yellow-400 text-blue-950' : 'text-blue-100/80 hover:text-white'
                  }`}
                >
                  {p} dias
                </button>
              ))}
            </div>
            <p className="text-xs text-blue-100/60">
              {dayLabel(a.days[0])} – {dayLabel(a.days[a.days.length - 1])}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Jogadores"
          value={String(a.week.players)}
          sub={share !== null ? `${share}% dos ${totalMembers} membros` : undefined}
          delta={<Delta current={a.week.players} previous={a.previous.players} period={period} />}
        />
        <StatTile
          icon={Activity}
          label="Partidas"
          value={String(a.week.plays)}
          sub={`${dec(a.week.plays / period)} por dia`}
          delta={<Delta current={a.week.plays} previous={a.previous.plays} period={period} />}
        />
        <StatTile
          icon={Repeat}
          label="Voltaram"
          value={String(a.week.returning)}
          sub="jogaram em 2 ou mais dias"
          delta={<Delta current={a.week.returning} previous={a.previous.returning} period={period} />}
        />
        <StatTile
          icon={CalendarDays}
          label="Assiduidade"
          value={dec(a.week.avgDaysPerPlayer)}
          sub={`dias por jogador, em ${period}`}
          delta={
            a.previous.avgDaysPerPlayer !== null ? (
              <span className="text-[11px] text-stone-500">antes: {dec(a.previous.avgDaysPerPlayer)}</span>
            ) : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-blue-950">Jogadores por dia</h4>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
              {a.games.map((g) => (
                <span key={g.gameId} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: GAME_COLOR[g.gameId] }} />
                  {title(g.gameId)}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed" style={{ borderColor: TOTAL_COLOR }} />
                Total
              </span>
            </div>
          </div>
          <PlayersLineChart key={period} analytics={a} />
          <details className="mt-2 text-xs text-stone-500">
            <summary className="cursor-pointer font-bold hover:text-blue-700">Ver em tabela</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="py-1 pr-3 font-bold">Jogo</th>
                    {a.days.map((d) => <th key={d} className="whitespace-nowrap px-2 py-1 font-bold capitalize">{dayLabel(d, a.days.length > 10)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {a.games.map((g) => (
                    <tr key={g.gameId} className="border-b border-stone-100">
                      <td className="whitespace-nowrap py-1 pr-3 font-bold text-stone-700">{title(g.gameId)}</td>
                      {g.daily.map((v, i) => <td key={i} className="px-2 py-1">{v}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="whitespace-nowrap py-1 pr-3 font-bold text-stone-700">Pessoas diferentes</td>
                    {a.daily.map((v, i) => <td key={i} className="px-2 py-1">{v}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="rounded-2xl bg-yellow-50 p-5 ring-1 ring-inset ring-yellow-200">
          <h4 className="flex items-center gap-2 font-bold text-blue-950">
            <Lightbulb className="h-4 w-4 text-yellow-600" /> Leitura rápida
          </h4>
          <ul className="mt-3 space-y-2.5 text-sm text-stone-700">
            {insights(a, totalMembers, guestRounds).map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h4 className="font-bold text-blue-950">Por jogo</h4>
        <div className="flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-stone-600" /> ganhou</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-stone-600/40" /> perdeu</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-stone-300" /> ficou a meio</span>
          <span className="text-stone-400">· no {title('vana-sentinela')}, ganhar = 11 ou mais certas</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {a.games.map((g) => (
          <GameCard
            key={g.gameId}
            stats={g}
            period={period}
            guestRounds={g.gameId === 'vana-sentinela' ? guestRounds : null}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-blue-950">
            <Clock className="h-4 w-4 text-blue-700" /> Quando jogam
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-6 sm:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs text-stone-500">Por dia da semana</p>
              <Bars
                values={a.weekdays}
                tip={(i, n) => `${WEEKDAYS[i]} · ${n}`}
                labels={WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
              />
            </div>
            <div>
              <p className="text-xs text-stone-500">Por hora do dia</p>
              <Bars
                values={a.hours}
                tip={(h, n) => `${h}h · ${n}`}
                labels={<><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></>}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-blue-950">
            <Medal className="h-4 w-4 text-yellow-600" /> Mais assíduos {period === 7 ? 'da semana' : `dos últimos ${period} dias`}
          </h4>
          {a.top.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Ainda ninguém jogou.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {a.top.map((p, i) => (
                <li key={p.userId} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2">
                  <span className={`${D} w-5 text-center text-lg font-extrabold ${i === 0 ? 'text-yellow-500' : 'text-stone-400'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-800">{memberNames[p.userId] ?? 'Membro'}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
                      {p.games.map((g) => (
                        <span key={g} className="h-2 w-2 rounded-full" style={{ background: GAME_COLOR[g] }} title={title(g)} />
                      ))}
                      {p.plays} {p.plays === 1 ? 'partida' : 'partidas'} em {joinPt(p.games.map(title))}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                    {p.days}/{period} dias
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
