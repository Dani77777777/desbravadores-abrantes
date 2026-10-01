'use client'

import { useState } from 'react'
import { Activity, Clock, Database, Lightbulb, Medal, Minus, Repeat, Target, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'
import { getGame } from '@/utils/games'
import { changePercent, type GameAnalytics, type GameStats, type SingleplayerGameId } from '@/utils/game-analytics'

const D = displayFont.className

// Cor fixa por jogo (paleta categórica validada, 3 primeiras posições) — nunca muda com filtros.
const GAME_COLOR: Record<SingleplayerGameId, string> = {
  'vana-trilha': '#2a78d6',
  vantur: '#eb6834',
  'vana-codigo': '#1baf7a',
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

function dayLabel(iso: string, short = false) {
  const d = new Date(`${iso}T12:00:00Z`)
  const wd = d.toLocaleDateString('pt-PT', { weekday: 'long', timeZone: 'UTC' }).slice(0, 3)
  return short ? wd : `${wd} ${d.getUTCDate()}`
}

/** Variação vs. semana anterior: ícone + texto (nunca só cor). */
function Delta({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const change = changePercent(current, previous)
  if (change === null) {
    return current > 0
      ? <span className="text-[11px] font-bold text-stone-500">novo esta semana</span>
      : <span className="text-[11px] text-stone-400">sem dados antes</span>
  }
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const tone = change > 0 ? 'text-emerald-700' : change < 0 ? 'text-red-600' : 'text-stone-500'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${tone}`} title={`Semana anterior: ${previous}${suffix}`}>
      <Icon className="h-3.5 w-3.5" />
      {change > 0 ? '+' : ''}{change}% vs. semana anterior
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

// ─── Gráfico de linhas: jogadores por dia, por jogo ──────────────────────────

function PlayersLineChart({ analytics }: { analytics: GameAnalytics }) {
  const [hover, setHover] = useState<number | null>(null)
  const { days, games, daily } = analytics
  const W = 700, H = 240, L = 34, R = 104, T = 14, B = 30
  const max = Math.max(4, ...games.flatMap((g) => g.daily))
  const step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const x = (i: number) => L + (i * (W - L - R)) / (days.length - 1)
  const y = (v: number) => T + (H - T - B) * (1 - v / top)

  // Etiquetas no fim de cada linha, afastadas para não se sobreporem
  const ends = games
    .map((g) => ({ g, y: y(g.daily[g.daily.length - 1]) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Jogadores por dia em cada jogo, nos últimos 7 dias">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#78716c">{t}</text>
          </g>
        ))}
        {days.map((d, i) => (
          <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={hover === i ? '#172554' : '#78716c'} fontWeight={hover === i ? 700 : 400}>
            {dayLabel(d)}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#a8a29e" strokeWidth={1} />}
        {games.map((g) => (
          <polyline
            key={g.gameId}
            points={g.daily.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={GAME_COLOR[g.gameId]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {games.map((g) =>
          g.daily.map((v, i) =>
            i === g.daily.length - 1 || i === hover ? (
              <circle key={`${g.gameId}-${i}`} cx={x(i)} cy={y(v)} r={4.5} fill={GAME_COLOR[g.gameId]} stroke="#fff" strokeWidth={2} />
            ) : null,
          ),
        )}
        {ends.map(({ g, y: ly }) => (
          <g key={g.gameId}>
            <text x={W - R + 12} y={ly + 4} fontSize={12} fontWeight={700} fill="#1c1917">{g.daily[g.daily.length - 1]}</text>
            <text x={W - R + 30} y={ly + 4} fontSize={12} fill="#57534e">{getGame(g.gameId)?.title}</text>
          </g>
        ))}
        {/* Zonas de hover (uma por dia, maiores do que as marcas) */}
        {days.map((d, i) => (
          <rect
            key={d}
            x={x(i) - (W - L - R) / (days.length - 1) / 2}
            y={0}
            width={(W - L - R) / (days.length - 1)}
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
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border border-stone-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
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
                {getGame(g.gameId)?.title}
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

function ModeBar({ mode, color }: { mode: GameStats['modes'][number]; color: string }) {
  const lost = mode.finished - mode.won
  const open = mode.plays - mode.finished
  const segments = [
    { n: mode.won, bg: color, label: 'ganhou' },
    { n: lost, bg: color, opacity: 0.4, label: 'perdeu' },
    { n: open, bg: '#d6d3d1', label: 'ficou a meio' },
  ].filter((s) => s.n > 0)

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-stone-700">{mode.label}</span>
        <span className="tabular-nums text-stone-500">
          {mode.plays} {mode.plays === 1 ? 'partida' : 'partidas'}
          {mode.avgAttempts !== null && ` · ${mode.avgAttempts.toFixed(1)} tent./vitória`}
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

function GameCard({ stats }: { stats: GameStats }) {
  const game = getGame(stats.gameId)
  const color = GAME_COLOR[stats.gameId]
  const { week, previous } = stats

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="h-1.5" style={{ background: color }} />
      <div className="flex items-center gap-3 p-4 pb-3">
        <img src={game?.image} alt="" className="h-11 w-11 rounded-xl bg-stone-50 object-contain p-1 ring-1 ring-stone-200" />
        <div className="min-w-0">
          <h4 className={`${D} text-lg font-extrabold text-blue-950`}>{game?.title}</h4>
          <Delta current={week.players} previous={previous.players} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-y border-stone-100 bg-stone-100 text-center">
        {[
          { v: String(week.players), l: week.players === 1 ? 'jogador' : 'jogadores' },
          { v: pct(week.winRate), l: 'vitórias' },
          { v: pct(week.completionRate), l: 'acabadas' },
        ].map((s) => (
          <div key={s.l} className="bg-white px-2 py-3">
            <p className={`${D} text-xl font-extrabold tabular-nums text-blue-950`}>{s.v}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-3 p-4">
        {week.plays === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">Ninguém jogou nos últimos 7 dias.</p>
        ) : (
          stats.modes.map((m) => <ModeBar key={m.mode} mode={m} color={color} />)
        )}
      </div>

      <p className="flex items-center gap-1.5 border-t border-stone-100 bg-stone-50/70 px-4 py-2.5 text-xs text-stone-500">
        <Repeat className="h-3.5 w-3.5" />
        {week.players === 0
          ? 'Sem jogadores esta semana'
          : `${week.returning} de ${week.players} voltaram noutro dia · ${week.plays} ${week.plays === 1 ? 'partida' : 'partidas'}`}
      </p>
    </div>
  )
}

// ─── Leitura rápida ───────────────────────────────────────────────────────────

function insights(a: GameAnalytics, totalMembers: number): string[] {
  const out: string[] = []
  const title = (id: SingleplayerGameId) => getGame(id)?.title ?? id
  const ranked = [...a.games].sort((x, y) => y.week.players - x.week.players)
  if (a.week.players === 0) return ['Ninguém jogou aos jogos a solo nos últimos 7 dias. Talvez valha a pena lembrar o clube num comunicado!']

  out.push(`${title(ranked[0].gameId)} é o mais jogado: ${ranked[0].week.players} ${ranked[0].week.players === 1 ? 'pessoa' : 'pessoas'} esta semana.`)
  for (const g of a.games) if (g.week.plays === 0) out.push(`Ninguém jogou ${title(g.gameId)} esta semana.`)

  // Modo onde mais gente desiste (pelo menos 3 partidas para ter significado)
  const quits = a.games
    .flatMap((g) => g.modes.map((m) => ({ g, m, rate: m.plays ? (m.plays - m.finished) / m.plays : 0 })))
    .filter((q) => q.m.plays >= 3 && q.rate >= 0.4)
    .sort((x, y) => y.rate - x.rate)[0]
  if (quits) out.push(`${Math.round(quits.rate * 100)}% deixam a partida a meio no ${title(quits.g.gameId)} (${quits.m.label}). Pode estar difícil demais.`)

  const hard = a.games
    .flatMap((g) => g.modes.map((m) => ({ g, m })))
    .filter(({ m }) => m.finished >= 3 && m.won / m.finished < 0.3)[0]
  if (hard && !quits) out.push(`Só ${Math.round((hard.m.won / hard.m.finished) * 100)}% ganham no ${title(hard.g.gameId)} (${hard.m.label}).`)

  const peak = a.hours.indexOf(Math.max(...a.hours))
  out.push(`Hora de ponta: entre as ${peak}h e as ${peak + 1}h.`)

  if (totalMembers > 0) {
    const share = Math.round((a.week.players / totalMembers) * 100)
    if (share < 25) out.push(`Só ${share}% dos membros jogaram. Há espaço para crescer!`)
  }
  return out.slice(0, 4)
}

// ─── Painel ───────────────────────────────────────────────────────────────────

export function GameAnalyticsPanel({ analytics, memberNames, totalMembers, scopeLabel }: {
  /** null quando a tabela game_plays ainda não existe (migração por correr). */
  analytics: GameAnalytics | null
  memberNames: Record<string, string>
  totalMembers: number
  scopeLabel: string
}) {
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

  const a = analytics
  const share = totalMembers ? Math.round((a.week.players / totalMembers) * 100) : null
  const maxHour = Math.max(1, ...a.hours)

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-blue-950 p-6 text-white shadow-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(50% 80% at 100% 0%, rgba(250,204,21,.18), transparent 70%), radial-gradient(40% 70% at 0% 100%, rgba(99,102,241,.3), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-yellow-300">
              <Activity className="h-4 w-4" /> Analítica · últimos 7 dias
            </p>
            <h3 className={`${D} mt-1 text-2xl font-extrabold`}>Como vão os jogos a solo</h3>
            <p className="text-sm text-blue-100/75">VANTUR, VanaTrilha e VanaCódigo · {scopeLabel}</p>
          </div>
          <p className="text-xs text-blue-100/60">
            {dayLabel(a.days[0])} – {dayLabel(a.days[6])}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Jogadores"
          value={String(a.week.players)}
          sub={share !== null ? `${share}% dos ${totalMembers} membros` : undefined}
          delta={<Delta current={a.week.players} previous={a.previous.players} />}
        />
        <StatTile
          icon={Activity}
          label="Partidas"
          value={String(a.week.plays)}
          sub={`${(a.week.plays / 7).toFixed(1)} por dia`}
          delta={<Delta current={a.week.plays} previous={a.previous.plays} />}
        />
        <StatTile
          icon={Target}
          label="Vitórias"
          value={pct(a.week.winRate)}
          sub={`${a.week.won} de ${a.week.finished} partidas acabadas`}
        />
        <StatTile
          icon={Repeat}
          label="Voltaram"
          value={String(a.week.returning)}
          sub="jogaram em 2 ou mais dias"
          delta={<Delta current={a.week.returning} previous={a.previous.returning} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-blue-950">Jogadores por dia</h4>
            <div className="flex flex-wrap gap-3 text-xs text-stone-600">
              {a.games.map((g) => (
                <span key={g.gameId} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: GAME_COLOR[g.gameId] }} />
                  {getGame(g.gameId)?.title}
                </span>
              ))}
            </div>
          </div>
          <PlayersLineChart analytics={a} />
          <details className="mt-2 text-xs text-stone-500">
            <summary className="cursor-pointer font-bold hover:text-blue-700">Ver em tabela</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="py-1 pr-3 font-bold">Jogo</th>
                    {a.days.map((d) => <th key={d} className="px-2 py-1 font-bold capitalize">{dayLabel(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {a.games.map((g) => (
                    <tr key={g.gameId} className="border-b border-stone-100">
                      <td className="py-1 pr-3 font-bold text-stone-700">{getGame(g.gameId)?.title}</td>
                      {g.daily.map((v, i) => <td key={i} className="px-2 py-1">{v}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pr-3 font-bold text-stone-700">Pessoas diferentes</td>
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
            {insights(a, totalMembers).map((t) => (
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
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {a.games.map((g) => <GameCard key={g.gameId} stats={g} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-blue-950">
            <Clock className="h-4 w-4 text-blue-700" /> Quando jogam
          </h4>
          <p className="text-xs text-stone-500">Partidas começadas por hora do dia</p>
          <div className="mt-4 flex h-28 items-end gap-[2px]">
            {a.hours.map((n, h) => (
              <div key={h} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-6 rounded-t bg-blue-700 transition-colors group-hover:bg-blue-900"
                  style={{ height: n ? `${Math.max(4, (n / maxHour) * 100)}%` : 0 }}
                />
                <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md bg-blue-950 px-2 py-0.5 text-[11px] font-bold text-white group-hover:block">
                  {h}h · {n}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-[10px] text-stone-400">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="flex items-center gap-2 font-bold text-blue-950">
            <Medal className="h-4 w-4 text-yellow-600" /> Mais assíduos da semana
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
                        <span key={g} className="h-2 w-2 rounded-full" style={{ background: GAME_COLOR[g] }} title={getGame(g)?.title} />
                      ))}
                      {p.won} {p.won === 1 ? 'vitória' : 'vitórias'} em {p.plays} {p.plays === 1 ? 'partida' : 'partidas'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                    {p.days}/7 dias
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
