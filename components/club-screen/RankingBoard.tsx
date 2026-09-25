'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import Image from 'next/image'
import { CalendarDays, ChevronDown, ChevronUp, Coins, Crown, Loader2, Minus, Rocket, Sparkles, Star, Trophy, TriangleAlert } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { displayFont } from '@/components/landing/fonts'
import { createClient } from '@/utils/supabase/client'
import { shortDisplayName } from '@/utils/display-name'
import { SCROLL_SPEEDS, type RankingSettings } from '@/utils/club-screen'
import {
  SECTION_COLORS,
  SECTION_LABELS,
  VIEW_LABELS,
  buildRanking,
  dayLabel,
  endOfDayIso,
  isSection,
  rankingHighlights,
  toRankingMembers,
  yesterdayKey,
  type RankedRow,
  type RankingMember,
  type RankingView,
} from '@/utils/ranking'
import { ClubBackdrop } from './ClubBackdrop'

const D = displayFont.className
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** Tempos da revelação "ontem → hoje" (ms). */
const REVEAL_WAIT = 1400
const COUNT_MS = 2600
const REORDER_AT = REVEAL_WAIT + COUNT_MS + 700
/** Tempos do scroll em ciclo (ms). */
const HOLD_TOP = 8000
const HOLD_BOTTOM = 3500
const BACK_UP = 2200
/** Atualiza os pontos de "agora" de minuto a minuto. */
const REFRESH_MS = 60_000
/** Todos os pontos até agora (uma data no futuro não depende do relógio deste computador). */
const ALL_TIME = '9999-12-31T23:59:59Z'

const VIEW_ICON: Record<RankingView, { icon: typeof Star; className: string; bar: string }> = {
  combined: { icon: Star, className: 'fill-orange-300 text-orange-300', bar: 'from-yellow-300 via-orange-400 to-red-500' },
  xp: { icon: Trophy, className: 'text-indigo-300', bar: 'from-indigo-400 to-violet-500' },
  gold: { icon: Coins, className: 'text-yellow-300', bar: 'from-yellow-300 to-amber-500' },
}

/** Pódio: 0 = 1.º lugar. */
const PODIUM = [
  { pedestal: 'from-yellow-300 to-amber-500 text-amber-950', height: 'h-[20vh]', avatar: 'h-[17vh] w-[17vh]', ring: 'ring-yellow-400' },
  { pedestal: 'from-slate-100 to-slate-400 text-slate-800', height: 'h-[14vh]', avatar: 'h-[13vh] w-[13vh]', ring: 'ring-slate-300' },
  { pedestal: 'from-orange-300 to-amber-700 text-orange-950', height: 'h-[10vh]', avatar: 'h-[13vh] w-[13vh]', ring: 'ring-orange-400' },
]
/** O 3.º aparece primeiro, depois o 2.º e por fim o 1.º (com a coroa). */
const PODIUM_REVEAL_MS = [1500, 850, 250]

type Shown = 'before' | 'counting' | 'after'

/** Como mostrar uma linha: pontos (a contar, se for a revelar) e as mudanças. */
type Display = {
  row: RankedRow
  from: number
  to: number
  counting: boolean
  showChanges: boolean
}

export function RankingBoard({ settings }: { settings: RankingSettings }) {
  const [supabase] = useState(() => createClient())
  const [beforeData, setBeforeData] = useState<RankingMember[] | null>(null)
  const [nowData, setNowData] = useState<RankingMember[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [today, setToday] = useState(() => new Date())

  const beforeDay = settings.beforeDay ?? yesterdayKey(today)
  const { view, section } = settings

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scroll = useAutoScroll(viewportRef, contentRef, settings.scrolling, SCROLL_SPEEDS[settings.speed])
  const flip = useFlip(contentRef)

  // ── Dados ──
  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_leaderboard_at_date', { target_date: endOfDayIso(beforeDay) }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.warn('get_leaderboard_at_date:', error.message)
        setLoadError(true)
      } else setBeforeData(toRankingMembers(data))
    })
    return () => {
      cancelled = true
    }
  }, [supabase, beforeDay])

  const shownRef = useRef<Shown>('before')
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_at_date', { target_date: ALL_TIME })
      if (cancelled) return
      if (error) {
        console.warn('get_leaderboard_at_date:', error.message)
        setLoadError(true)
        return
      }
      // Se alguém ganhou pontos com o ranking no ecrã, as linhas deslizam para o sítio novo.
      if (shownRef.current === 'after') flip.capture()
      setLoadError(false)
      setNowData(toRankingMembers(data))
      setToday(new Date())
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [supabase, flip])

  const ready = !!beforeData && !!nowData

  // ── Revelação: antes → pontos a contar → novas posições ──
  // `progress` diz em que passo vai a revelação `id`; uma revelação nova começa no "antes".
  const [progress, setProgress] = useState<{ id: string | null; shown: Shown }>(() => ({
    id: settings.revealed ? settings.revealId : null,
    shown: 'after',
  }))
  const shown: Shown = !settings.revealed ? 'before' : progress.id === settings.revealId ? progress.shown : 'before'
  const playedRef = useRef<string | null>(settings.revealed ? settings.revealId : null)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  useEffect(() => {
    if (!settings.revealed || !ready || playedRef.current === settings.revealId) return
    const id = settings.revealId
    playedRef.current = id
    scroll.toTop(REORDER_AT + 2500)
    const t1 = setTimeout(() => setProgress({ id, shown: 'counting' }), REVEAL_WAIT)
    const t2 = setTimeout(() => {
      flip.capture()
      setProgress({ id, shown: 'after' })
    }, REORDER_AT)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [settings.revealed, settings.revealId, ready, scroll, flip])

  // Mudar a vista ou a secção volta ao topo.
  const listKey = `${view}-${section}`
  useEffect(() => {
    scroll.toTop()
  }, [listKey, scroll])

  const beforeRows = useMemo(() => (beforeData ? buildRanking(beforeData, view, section) : []), [beforeData, view, section])
  const afterRows = useMemo(
    () => (nowData ? buildRanking(nowData, view, section, beforeData) : []),
    [nowData, beforeData, view, section],
  )

  const displays: Display[] = useMemo(() => {
    if (shown === 'after') return afterRows.map((row) => ({ row, from: row.score, to: row.score, counting: false, showChanges: true }))
    const afterById = new Map(afterRows.map((r) => [r.member.id, r]))
    return beforeRows.map((row) => ({
      row,
      from: row.score,
      to: shown === 'counting' ? afterById.get(row.member.id)?.score ?? row.score : row.score,
      counting: shown === 'counting',
      showChanges: false,
    }))
  }, [shown, beforeRows, afterRows])

  useLayoutEffect(() => {
    flip.play()
  }, [displays, flip])

  const highlights = useMemo(() => (shown === 'after' ? rankingHighlights(afterRows) : null), [shown, afterRows])
  const clubGained = useMemo(() => afterRows.reduce((sum, r) => sum + Math.max(0, r.gained), 0), [afterRows])

  const podium = displays.slice(0, 3)
  const cards = displays.slice(3, 5)
  const rest = displays.slice(5)
  const best = Math.max(1, displays[0]?.to ?? 0)
  const podiumKey = shown === 'after' ? `after-${settings.revealId ?? ''}-${listKey}` : `before-${listKey}`

  const ViewIcon = VIEW_ICON[view].icon
  const beforeLabel = dayLabel(beforeDay, today)

  return (
    <div className="relative h-full w-full overflow-hidden bg-blue-950 text-white">
      <ClubBackdrop />

      {/* Cabeçalho fixo */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-[3vh] bg-gradient-to-b from-blue-950 via-blue-950/85 to-transparent px-[5vh] pb-[4vh] pt-[2.5vh]">
        <div className="flex min-w-0 items-center gap-[2vh]">
          <Image src="/images/Logo Desbravadores.png" alt="" width={160} height={166} className="h-[7vh] w-auto" />
          <div className="min-w-0">
            <p className="flex items-center gap-[1vh] text-[1.7vh] font-semibold uppercase tracking-[0.3em] text-yellow-300">
              <Trophy className="h-[1.8vh] w-[1.8vh]" /> Ranking
            </p>
            <h1 className={`${D} flex items-center gap-[1.5vh] text-[4.4vh] font-extrabold leading-tight`}>
              {VIEW_LABELS[view].title}
              {isSection(section) && (
                <span className={`rounded-full px-[1.6vh] py-[0.4vh] text-[2vh] font-bold uppercase tracking-wide ${SECTION_COLORS[section]}`}>
                  {SECTION_LABELS[section]}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div
          key={shown === 'after' ? 'after' : 'before'}
          className={`cs-enter flex shrink-0 items-center gap-[1.2vh] rounded-full px-[2.4vh] py-[1.2vh] text-[2.2vh] font-extrabold ${
            shown === 'after'
              ? 'bg-yellow-400 text-blue-950 shadow-[0_1.5vh_4vh_-1.5vh_rgba(250,204,21,.7)]'
              : 'bg-white/[0.08] text-blue-100 ring-1 ring-inset ring-white/15'
          }`}
        >
          {shown === 'after' ? (
            <>
              <Sparkles className="h-[2.4vh] w-[2.4vh]" />
              Hoje{clubGained > 0 && <span className="font-black">· +{clubGained} desde {beforeLabel}</span>}
            </>
          ) : (
            <>
              <CalendarDays className="h-[2.4vh] w-[2.4vh]" />
              Como estávamos {beforeLabel === 'ontem' || beforeLabel === 'anteontem' ? beforeLabel : `a ${beforeLabel}`}
            </>
          )}
        </div>
      </header>

      <div ref={viewportRef} className="absolute inset-0 overflow-hidden">
        <div ref={contentRef} className="relative mx-auto w-full max-w-[150vh] px-[5vh] pb-[14vh] pt-[16vh] will-change-transform">
          {!ready ? (
            <div className="flex h-[70vh] flex-col items-center justify-center text-center">
              {loadError ? (
                <>
                  <TriangleAlert className="h-[8vh] w-[8vh] text-yellow-300" />
                  <p className="mt-[3vh] text-[4vh] font-black">Não foi possível carregar o ranking</p>
                  <p className="mt-[1vh] text-[2.4vh] text-blue-200">A tentar outra vez dentro de um minuto…</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-[8vh] w-[8vh] animate-spin text-yellow-300" />
                  <p className="mt-[3vh] text-[3vh] font-bold text-blue-200">A carregar o ranking…</p>
                </>
              )}
            </div>
          ) : displays.length === 0 ? (
            <div className="flex h-[70vh] items-center justify-center rounded-[3vh] border-2 border-dashed border-white/15 text-[3vh] text-blue-200/70">
              Ainda não há ninguém neste ranking.
            </div>
          ) : (
            <div key={listKey} className="cs-stage-in">
              {/* Top 3 */}
              <div key={podiumKey} className="mx-auto grid max-w-[120vh] grid-cols-3 items-end gap-[3vh]">
                {[1, 0, 2].map((place) => {
                  const d = podium[place]
                  if (!d) return <div key={place} />
                  return <PodiumPlace key={d.row.member.id} place={place} display={d} view={view} />
                })}
              </div>

              {/* 4.º e 5.º */}
              {cards.length > 0 && (
                <div className="mx-auto mt-[4vh] grid max-w-[140vh] grid-cols-2 gap-[3vh]">
                  {cards.map((d) => (
                    <TopCard key={d.row.member.id} display={d} view={view} />
                  ))}
                </div>
              )}

              {/* Destaques depois de revelar */}
              {highlights && (highlights.climber || highlights.gainers.length > 0) && (
                <Highlights climber={highlights.climber} gainers={highlights.gainers} beforeLabel={beforeLabel} view={view} />
              )}

              {/* Do 6.º para baixo */}
              {rest.length > 0 && (
                <ol className="mx-auto mt-[4vh] max-w-[140vh] space-y-[1.4vh]">
                  {rest.map((d) => (
                    <ListRow key={d.row.member.id} display={d} view={view} best={best} />
                  ))}
                </ol>
              )}

              <div className="mt-[6vh] flex items-center justify-center gap-[1.5vh] text-[2vh] font-semibold uppercase tracking-[0.3em] text-blue-200/40">
                <ViewIcon className="h-[2vh] w-[2vh]" /> Desbravadores Abrantes
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Peças ────────────────────────────────────────────────────────────

function MemberAvatar({ member, className, fallbackClass }: { member: RankingMember; className: string; fallbackClass: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ''} className="object-cover" />
      <AvatarFallback className={`bg-blue-800 font-bold text-white ${fallbackClass}`}>{member.full_name?.charAt(0) || '?'}</AvatarFallback>
    </Avatar>
  )
}

function SectionBadge({ section }: { section: string | null }) {
  if (!isSection(section)) return null
  return (
    <span className={`inline-flex rounded-full px-[1vh] py-[0.25vh] text-[1.35vh] font-bold uppercase tracking-wide text-white ${SECTION_COLORS[section]}`}>
      {SECTION_LABELS[section]}
    </span>
  )
}

function LeaderBadge({ member }: { member: RankingMember }) {
  if (!member.is_leader) return null
  return (
    <span className="inline-flex rounded-full bg-yellow-400/15 px-[1vh] py-[0.25vh] text-[1.35vh] font-bold uppercase tracking-wide text-yellow-200 ring-1 ring-inset ring-yellow-300/50">
      Dirigente
    </span>
  )
}

/** Pontos: a contar de `from` até `to` quando `counting`, com um "+N" a flutuar. */
function Score({ display, className }: { display: Display; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const { from, to, counting } = display
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!counting || from === to) {
      el.textContent = String(to)
      return
    }
    el.textContent = String(from)
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / COUNT_MS))
      const eased = 1 - Math.pow(1 - p, 3)
      el.textContent = String(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, counting])

  const diff = to - from
  return (
    <span className={`relative inline-block tabular-nums ${className ?? ''}`}>
      <span ref={ref} />
      {counting && diff !== 0 && (
        <span
          className={`cs-plus pointer-events-none absolute -top-[1vh] left-full ml-[1vh] whitespace-nowrap rounded-full px-[1vh] py-[0.2vh] text-[0.6em] font-black ${
            diff > 0 ? 'bg-yellow-400 text-blue-950' : 'bg-red-500 text-white'
          }`}
        >
          {diff > 0 ? `+${diff}` : diff}
        </span>
      )}
    </span>
  )
}

/** ▲3 / ▼2 / = / NOVO */
function MoveBadge({ row, size = 'md' }: { row: RankedRow; size?: 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-[2.2vh] px-[1.4vh] py-[0.5vh]' : 'text-[1.7vh] px-[1vh] py-[0.35vh]'
  const icon = size === 'lg' ? 'h-[2.4vh] w-[2.4vh]' : 'h-[1.9vh] w-[1.9vh]'
  if (row.isNew) return <span className={`rounded-full bg-yellow-400 font-black text-blue-950 ${text}`}>NOVO</span>
  if (row.move === null) return null
  if (row.move > 0)
    return (
      <span className={`inline-flex items-center gap-[0.3vh] rounded-full bg-emerald-400/20 font-black text-emerald-300 ring-1 ring-inset ring-emerald-300/30 ${text}`}>
        <ChevronUp className={icon} strokeWidth={3} /> {row.move}
      </span>
    )
  if (row.move < 0)
    return (
      <span className={`inline-flex items-center gap-[0.3vh] rounded-full bg-red-500/20 font-black text-red-300 ring-1 ring-inset ring-red-300/30 ${text}`}>
        <ChevronDown className={icon} strokeWidth={3} /> {-row.move}
      </span>
    )
  return (
    <span className={`inline-flex items-center rounded-full bg-white/10 font-black text-blue-200/70 ${text}`}>
      <Minus className={icon} strokeWidth={3} />
    </span>
  )
}

function Gained({ row, className }: { row: RankedRow; className?: string }) {
  if (!row.gained) return null
  return (
    <span className={`font-black ${row.gained > 0 ? 'text-yellow-300' : 'text-red-300/80'} ${className ?? ''}`}>
      {row.gained > 0 ? `+${row.gained}` : row.gained}
    </span>
  )
}

function PodiumPlace({ place, display, view }: { place: number; display: Display; view: RankingView }) {
  const { row } = display
  const style = PODIUM[place]
  const revealAt = PODIUM_REVEAL_MS[place]
  const Icon = VIEW_ICON[view].icon
  return (
    <div className="flex flex-col items-center">
      <div className="lp-rise flex w-full flex-col items-center" style={delay(revealAt + 250)}>
        <div className="relative mb-[2vh]">
          {place === 0 && (
            <span className="lp-crown absolute -top-[6.5vh] left-1/2 z-10 -translate-x-1/2" style={delay(revealAt + 650)}>
              <Crown className="lp-float block h-[6vh] w-[6vh] fill-yellow-400 text-yellow-400 drop-shadow-[0_0_2vh_rgba(250,204,21,.7)]" />
            </span>
          )}
          {place === 0 && <div aria-hidden className="cs-glow absolute -inset-[3vh] rounded-full bg-yellow-400/30 blur-[4vh]" />}
          <MemberAvatar
            member={row.member}
            className={`relative ${style.avatar} ring-[0.6vh] ${style.ring} ring-offset-[0.6vh] ring-offset-blue-950`}
            fallbackClass="text-[6vh]"
          />
        </div>
        <p className={`${D} w-full truncate px-[1vh] text-center text-[3.6vh] font-extrabold leading-tight`}>
          {shortDisplayName(row.member.full_name, 'Membro')}
        </p>
        <div className="mt-[0.6vh] flex items-center gap-[1vh]">
          <SectionBadge section={row.member.section} />
          <LeaderBadge member={row.member} />
          {display.showChanges && <MoveBadge row={row} />}
        </div>
        <p className={`${D} mb-[2vh] mt-[1vh] flex items-center gap-[1vh] text-[4.2vh] font-extrabold text-blue-50`}>
          <Score display={display} />
          <Icon className={`h-[3.4vh] w-[3.4vh] ${VIEW_ICON[view].className}`} />
          {display.showChanges && <Gained row={row} className="text-[2.4vh]" />}
        </p>
      </div>
      <div
        className={`lp-grow relative flex w-full items-start justify-center rounded-t-[2.5vh] bg-gradient-to-b pt-[1vh] shadow-[inset_0_0.3vh_0_rgba(255,255,255,.5)] ${style.pedestal} ${style.height}`}
        style={delay(revealAt)}
      >
        <span className={`${D} text-[8vh] font-extrabold leading-none`}>{place + 1}</span>
      </div>
    </div>
  )
}

function TopCard({ display, view }: { display: Display; view: RankingView }) {
  const { row } = display
  const Icon = VIEW_ICON[view].icon
  return (
    <div
      data-flip={row.member.id}
      className="relative flex items-center gap-[2.2vh] overflow-hidden rounded-[3vh] bg-gradient-to-br from-white/[0.14] to-white/[0.05] p-[2.2vh] pr-[3vh] ring-2 ring-inset ring-indigo-200/30 shadow-[0_2vh_5vh_-2vh_rgba(0,0,0,.5)]"
    >
      <span className={`${D} w-[5vh] shrink-0 text-center text-[5.5vh] font-extrabold leading-none text-indigo-200`}>{row.rank}</span>
      <MemberAvatar member={row.member} className="h-[9vh] w-[9vh] shrink-0 ring-[0.45vh] ring-indigo-300/70" fallbackClass="text-[4vh]" />
      <div className="min-w-0 flex-1">
        <p className={`${D} truncate text-[3vh] font-extrabold leading-tight`}>{shortDisplayName(row.member.full_name, 'Membro')}</p>
        <div className="mt-[0.8vh] flex items-center gap-[1vh]">
          <SectionBadge section={row.member.section} />
          <LeaderBadge member={row.member} />
          {display.showChanges && <MoveBadge row={row} />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`${D} flex items-center justify-end gap-[0.8vh] text-[4vh] font-extrabold leading-none`}>
          <Score display={display} />
          <Icon className={`h-[3vh] w-[3vh] ${VIEW_ICON[view].className}`} />
        </p>
        <p className="mt-[0.8vh] text-[1.6vh] font-bold uppercase tracking-wider text-blue-200/60">
          {display.showChanges && row.gained !== 0 ? <Gained row={row} className="text-[2vh]" /> : VIEW_LABELS[view].unit}
        </p>
      </div>
    </div>
  )
}

function ListRow({ display, view, best }: { display: Display; view: RankingView; best: number }) {
  const { row } = display
  const Icon = VIEW_ICON[view].icon
  const width = Math.max(3, Math.round((Math.max(0, display.to) / best) * 100))
  return (
    <li
      data-flip={row.member.id}
      className="relative flex h-[8.6vh] items-center gap-[2vh] rounded-[2.2vh] bg-white/[0.06] px-[2vh] ring-1 ring-inset ring-white/10"
    >
      <span className={`${D} w-[6vh] shrink-0 text-center text-[3.4vh] font-extrabold text-blue-200/60`}>{row.rank}</span>
      <MemberAvatar member={row.member} className="h-[6vh] w-[6vh] shrink-0 ring-[0.3vh] ring-white/15" fallbackClass="text-[2.6vh]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[1vh]">
          <span className="truncate text-[2.8vh] font-bold leading-tight">{row.member.full_name}</span>
          {row.member.is_invested && <span className="h-[1.1vh] w-[1.1vh] shrink-0 rounded-full bg-yellow-400 ring-[0.4vh] ring-yellow-400/30" title="Investido" />}
        </div>
        <div className="mt-[0.8vh] flex items-center gap-[1.2vh]">
          <SectionBadge section={row.member.section} />
          <LeaderBadge member={row.member} />
          <div className="h-[0.8vh] flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-[2600ms] ease-out ${VIEW_ICON[view].bar}`}
              style={{ width: `${width}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex w-[9vh] shrink-0 justify-center">{display.showChanges && <MoveBadge row={row} />}</div>
      <div className="w-[16vh] shrink-0 text-right">
        <div className={`${D} flex items-center justify-end gap-[0.6vh] text-[3.4vh] font-extrabold leading-none`}>
          <Score display={display} />
          <Icon className={`h-[2.4vh] w-[2.4vh] ${VIEW_ICON[view].className}`} />
        </div>
        <div className="mt-[0.5vh] text-[1.5vh] font-bold uppercase tracking-wider text-blue-200/50">
          {display.showChanges && row.gained !== 0 ? <Gained row={row} className="text-[1.9vh]" /> : VIEW_LABELS[view].unit}
        </div>
      </div>
    </li>
  )
}

function Highlights({
  climber,
  gainers,
  beforeLabel,
  view,
}: {
  climber: RankedRow | null
  gainers: RankedRow[]
  beforeLabel: string
  view: RankingView
}) {
  const since = `desde ${beforeLabel}`
  return (
    <div className="cs-enter mx-auto mt-[4vh] grid max-w-[140vh] grid-cols-2 gap-[3vh]" style={delay(2600)}>
      <div className="flex items-center gap-[2vh] rounded-[3vh] bg-emerald-400/10 p-[2.2vh] ring-1 ring-inset ring-emerald-300/25">
        <Rocket className="h-[5vh] w-[5vh] shrink-0 text-emerald-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[1.7vh] font-bold uppercase tracking-[0.2em] text-emerald-300">Maior subida</p>
          {climber ? (
            <p className="mt-[0.4vh] flex items-center gap-[1.2vh] text-[3vh] font-extrabold">
              <span className="truncate">{shortDisplayName(climber.member.full_name, 'Membro')}</span>
              <MoveBadge row={climber} size="lg" />
            </p>
          ) : (
            <p className="mt-[0.4vh] text-[2.4vh] font-bold text-blue-200/70">Ninguém mudou de lugar</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-[2vh] rounded-[3vh] bg-yellow-400/10 p-[2.2vh] ring-1 ring-inset ring-yellow-300/25">
        <Sparkles className="h-[5vh] w-[5vh] shrink-0 text-yellow-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[1.7vh] font-bold uppercase tracking-[0.2em] text-yellow-300">
            Mais {VIEW_LABELS[view].unit.toLowerCase()} {since}
          </p>
          {gainers.length > 0 ? (
            <div className="mt-[0.6vh] flex flex-wrap items-center gap-x-[2vh] gap-y-[0.5vh] text-[2.5vh] font-bold">
              {gainers.map((g) => (
                <span key={g.member.id} className="flex items-center gap-[0.8vh]">
                  <MemberAvatar member={g.member} className="h-[3.6vh] w-[3.6vh]" fallbackClass="text-[1.6vh]" />
                  <span className="max-w-[22vh] truncate">{g.member.full_name?.split(' ')[0]}</span>
                  <Gained row={g} />
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-[0.4vh] text-[2.4vh] font-bold text-blue-200/70">Ainda ninguém ganhou pontos</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Scroll em ciclo ───────────────────────────────────────────────────

/**
 * Fica no topo (os tops), desce devagar até ao fim, espera, volta ao topo e repete.
 * Move o conteúdo com transform (suave no projetor). Pausar só pára a descida.
 */
function useAutoScroll(
  viewportRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  speed: number,
) {
  const enabledRef = useRef(enabled)
  const speedRef = useRef(speed)
  useEffect(() => {
    enabledRef.current = enabled
    speedRef.current = speed
  }, [enabled, speed])

  const ctl = useRef({
    y: 0,
    phase: 'hold-top' as 'hold-top' | 'down' | 'hold-bottom' | 'up',
    since: 0,
    hold: HOLD_TOP,
    upFrom: 0,
  })

  useEffect(() => {
    const c = ctl.current
    c.since = performance.now()
    let last = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      const viewport = viewportRef.current
      const content = contentRef.current
      if (viewport && content) {
        const vh = viewport.clientHeight
        const max = Math.max(0, content.offsetHeight - vh)
        if (c.phase === 'hold-top') {
          if (!enabledRef.current) c.since = t
          else if (t - c.since > c.hold && max > 2) {
            c.phase = 'down'
            c.since = t
          }
        } else if (c.phase === 'down') {
          if (enabledRef.current) c.y = Math.min(max, c.y + speedRef.current * vh * dt)
          if (c.y >= max) {
            c.phase = 'hold-bottom'
            c.since = t
          }
        } else if (c.phase === 'hold-bottom') {
          if (!enabledRef.current) c.since = t
          else if (t - c.since > HOLD_BOTTOM) {
            c.phase = 'up'
            c.since = t
            c.upFrom = c.y
          }
        } else {
          const p = Math.min(1, (t - c.since) / BACK_UP)
          const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
          c.y = c.upFrom * (1 - eased)
          if (p >= 1) {
            c.phase = 'hold-top'
            c.since = t
          }
        }
        if (c.y > max) c.y = max
        content.style.transform = `translate3d(0, ${-c.y}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [viewportRef, contentRef])

  /** Volta ao topo (suave) e fica lá `hold` ms antes de voltar a descer. */
  const toTop = useCallback((hold: number = HOLD_TOP) => {
    const c = ctl.current
    c.hold = hold
    c.since = performance.now()
    if (c.y > 1) {
      c.phase = 'up'
      c.upFrom = c.y
    } else {
      c.phase = 'hold-top'
    }
    // Depois desta espera, as seguintes voltam ao normal.
    setTimeout(() => {
      if (c.hold === hold) c.hold = HOLD_TOP
    }, hold + BACK_UP + 100)
  }, [])

  return useMemo(() => ({ toTop }), [toTop])
}

// ── Linhas a deslizar para o lugar novo (FLIP) ────────────────────────

/**
 * `capture()` guarda onde está cada `[data-flip]` antes de mudar a ordem; depois do
 * render, `play()` põe cada um onde estava e anima até ao sítio novo. Quem não
 * estava (ex.: saiu do pódio) aparece com uma entrada suave.
 */
function useFlip(containerRef: RefObject<HTMLDivElement | null>) {
  const captured = useRef<Map<string, { x: number; y: number }> | null>(null)

  const capture = useCallback(() => {
    const c = containerRef.current
    if (!c) return
    const base = c.getBoundingClientRect()
    const map = new Map<string, { x: number; y: number }>()
    c.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const r = el.getBoundingClientRect()
      map.set(el.dataset.flip!, { x: r.left - base.left, y: r.top - base.top })
    })
    captured.current = map
  }, [containerRef])

  const play = useCallback(() => {
    const map = captured.current
    const c = containerRef.current
    if (!map || !c) return
    captured.current = null
    const base = c.getBoundingClientRect()
    let i = 0
    c.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const old = map.get(el.dataset.flip!)
      if (!old) {
        el.classList.remove('cs-enter')
        void el.offsetWidth
        el.style.setProperty('--d', '900ms')
        el.classList.add('cs-enter')
        return
      }
      const r = el.getBoundingClientRect()
      const dx = old.x - (r.left - base.left)
      const dy = old.y - (r.top - base.top)
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      const wait = Math.min(i++ * 40, 800)
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.style.zIndex = '5'
      void el.offsetWidth
      requestAnimationFrame(() => {
        el.style.transition = `transform 1.4s cubic-bezier(.2, .8, .2, 1) ${wait}ms`
        el.style.transform = ''
        const done = () => {
          el.style.transition = ''
          el.style.zIndex = ''
          el.removeEventListener('transitionend', done)
        }
        el.addEventListener('transitionend', done)
      })
    })
  }, [containerRef])

  return useMemo(() => ({ capture, play }), [capture, play])
}
