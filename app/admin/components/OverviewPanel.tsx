'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { computeStoreEconomy, formatEur, type GoldRateInfo } from '@/lib/store-economy'
import { displayFont } from '@/components/landing/fonts'
import {
  SECTION_LABELS, SECTION_SOLID, TZ, attendanceByEvent, averageRate, daysUntil, fmtParts, relativeDayLabel,
  type AttendanceRow,
} from './event-utils'
import {
  Users, ShieldCheck, Trophy, Coins, Cake, ChevronRight, CalendarDays, Package, Check, Tag, Wallet, Gauge,
  Layers, Clock, Banknote, AlertTriangle, MessageSquare, ListChecks, ArrowRightLeft, PartyPopper, Activity,
  CalendarClock, Sparkles, UserPlus,
} from 'lucide-react'

const D = displayFont.className

interface OverviewPanelProps {
  profile: any
  members: any[]
  events: any[]
  purchases: any[]
  rateInfo: GoldRateInfo | null
  // Loja só para coordenadores reais (os ajudantes não mexem em pagamentos).
  canManageStore: boolean
  attendance: AttendanceRow[]
  suggestions: any[]
  tasks: any[]
  completions: any[]
  sectionSuggestions: any[]
}

function rateColor(rate: number | null) {
  if (rate === null) return { bar: 'bg-stone-300', text: 'text-stone-400' }
  if (rate >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
  if (rate >= 60) return { bar: 'bg-amber-400', text: 'text-amber-600' }
  return { bar: 'bg-rose-500', text: 'text-rose-600' }
}

export function OverviewPanel({
  profile, members, events, purchases, rateInfo, canManageStore, attendance, suggestions, tasks, completions, sectionSuggestions,
}: OverviewPanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  // ── Membros ────────────────────────────────────────────────────────────────
  const totalMembers = members.length
  const scouts = members.filter(m => m.role === 'desbravador')
  const leaders = totalMembers - scouts.length
  const investedMembers = members.filter(m => m.is_invested).length
  const notInvested = members.filter(m => !m.is_invested)
  const investmentRate = totalMembers > 0 ? Math.round((investedMembers / totalMembers) * 100) : 0
  const totalXP = members.reduce((acc, m) => acc + (m.total_xp || 0), 0)
  const totalGold = members.reduce((acc, m) => acc + (m.current_gold || 0), 0)
  const avgXP = totalMembers > 0 ? Math.round(totalXP / totalMembers) : 0
  const newMembers30 = members.filter(m => m.created_at && now - new Date(m.created_at).getTime() <= 30 * 86_400_000).length

  // ── Eventos e presenças ────────────────────────────────────────────────────
  const attendanceMap = attendanceByEvent(attendance)
  const avgAttendance = averageRate(attendanceMap.values())
  const finishedWithStats = events
    .filter(e => e.is_finished && attendanceMap.has(e.id))
    .slice(0, 8)
    .reverse() // do mais antigo para o mais recente (gráfico da esquerda para a direita)
  const upcomingEvents = events
    .filter(e => !e.is_finished && new Date(e.start_at).getTime() >= now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const overdueEvents = events.filter(e => {
    if (e.is_finished) return false
    const end = e.end_at ? new Date(e.end_at).getTime() : new Date(e.start_at).getTime()
    return end < now
  })
  const nextEvent = upcomingEvents[0]

  // ── Aniversários (próximos 30 dias) ────────────────────────────────────────
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0)
  const birthdays = members
    .filter(m => m.birth_date)
    .map(m => {
      const b = new Date(m.birth_date)
      const next = new Date(todayMidnight.getFullYear(), b.getUTCMonth(), b.getUTCDate())
      if (next < todayMidnight) next.setFullYear(todayMidnight.getFullYear() + 1)
      const age = next.getFullYear() - b.getUTCFullYear()
      return { ...m, daysUntil: Math.round((next.getTime() - todayMidnight.getTime()) / 86_400_000), age }
    })
    .filter(m => m.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const birthdaysToday = birthdays.filter(b => b.daysUntil === 0)

  // ── Tarefas e sugestões ────────────────────────────────────────────────────
  const activeTasks = tasks.filter(t => !t.deadline || new Date(t.deadline).getTime() >= todayMidnight.getTime())
  const pendingApprovals = completions.filter(c => !c.points_awarded)
  const completions30 = completions.filter(c => c.completed_at && now - new Date(c.completed_at).getTime() <= 30 * 86_400_000).length
  const unreadSuggestions = suggestions.filter(s => !s.is_read)

  // ── Classes ────────────────────────────────────────────────────────────────
  const sectionOfUser = new Map(members.map(m => [m.id, m.section]))
  const sections = Object.keys(SECTION_LABELS).map(key => {
    const inSection = members.filter(m => m.section === key)
    const rows = attendance.filter(r => sectionOfUser.get(r.user_id) === key)
    const attended = rows.filter(r => r.status !== 'faltou').length
    return {
      key,
      label: SECTION_LABELS[key],
      count: inSection.length,
      invested: inSection.filter(m => m.is_invested).length,
      avgXP: inSection.length ? Math.round(inSection.reduce((a, m) => a + (m.total_xp || 0), 0) / inSection.length) : 0,
      gold: inSection.reduce((a, m) => a + (m.current_gold || 0), 0),
      attendance: rows.length ? Math.round((attended / rows.length) * 100) : null,
    }
  })
  const maxSectionCount = Math.max(1, ...sections.map(s => s.count))

  // ── Top XP ─────────────────────────────────────────────────────────────────
  const topPerformers = [...scouts].sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0)).slice(0, 5)

  // ── Loja ───────────────────────────────────────────────────────────────────
  const pendingOrders = purchases.filter(p => p.status === 'pending')
  const unpaidOrders = pendingOrders.filter(p => !p.paid_at)
  const paidUndelivered = pendingOrders.filter(p => p.paid_at)
  const pendingList = [...unpaidOrders, ...paidUndelivered].slice(0, 5)

  const {
    goldN, avgGold, avgGoldPerEvent, monthlyIncome,
    affordCount, priceTiers,
    levelBuckets, maxBucket,
  } = computeStoreEconomy(members, events)

  const goldRate = rateInfo?.gold_per_euro || 100
  const validPurchases = purchases.filter(p => p.status !== 'refunded')
  const cashToCollect = unpaidOrders.reduce((acc, p) => acc + Number(p.amount_due_eur || 0), 0)
  const cashCollected = validPurchases.filter(p => p.paid_at).reduce((acc, p) => acc + Number(p.amount_due_eur || 0), 0)
  const discountsGiven = validPurchases.reduce((acc, p) => acc + Number(p.discount_eur || 0), 0)
  const goldSpent = validPurchases.reduce((acc, p) => acc + (p.gold_spent || 0), 0)
  const itemsSold = validPurchases.reduce((acc, p) => acc + (p.quantity || 1), 0)
  const deliveredCount = purchases.filter(p => p.status === 'delivered').length

  const handlePayAndDeliver = async (purchaseId: string) => {
    setLoading(purchaseId)
    try {
      // Atalho do overview: confirma pagamento e entrega num só passo.
      const { error } = await supabase.rpc('mark_purchase_paid', { p_purchase_id: purchaseId, p_deliver: true })

      if (error) throw error

      toast.success('Pagamento e entrega confirmados!')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao confirmar a encomenda.')
    } finally {
      setLoading(null)
    }
  }

  const handleDeliverOnly = async (purchaseId: string) => {
    setLoading(purchaseId)
    try {
      const { error } = await supabase.rpc('mark_purchase_delivered', { p_purchase_id: purchaseId })

      if (error) throw error

      toast.success('Artigo marcado como entregue!')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao marcar entrega.')
    } finally {
      setLoading(null)
    }
  }

  // ── "Precisa de atenção" ───────────────────────────────────────────────────
  const attention = [
    { show: overdueEvents.length > 0, icon: AlertTriangle, tone: 'bg-amber-500', count: overdueEvents.length, label: overdueEvents.length === 1 ? 'evento terminou sem presenças registadas' : 'eventos terminaram sem presenças registadas', href: '/admin?tab=events' },
    { show: pendingApprovals.length > 0, icon: ListChecks, tone: 'bg-blue-600', count: pendingApprovals.length, label: pendingApprovals.length === 1 ? 'tarefa concluída à espera de aprovação' : 'tarefas concluídas à espera de aprovação', href: '/admin?tab=tasks' },
    { show: unreadSuggestions.length > 0, icon: MessageSquare, tone: 'bg-violet-500', count: unreadSuggestions.length, label: unreadSuggestions.length === 1 ? 'sugestão por ler' : 'sugestões por ler', href: '/admin?tab=suggestions' },
    { show: unpaidOrders.length > 0, icon: Banknote, tone: 'bg-rose-500', count: unpaidOrders.length, label: `${unpaidOrders.length === 1 ? 'encomenda' : 'encomendas'} por pagar (${formatEur(cashToCollect)})`, href: '/admin?tab=store' },
    { show: paidUndelivered.length > 0, icon: Package, tone: 'bg-orange-500', count: paidUndelivered.length, label: paidUndelivered.length === 1 ? 'encomenda paga por entregar' : 'encomendas pagas por entregar', href: '/admin?tab=store' },
    { show: sectionSuggestions.length > 0, icon: ArrowRightLeft, tone: 'bg-teal-500', count: sectionSuggestions.length, label: sectionSuggestions.length === 1 ? 'membro com idade para mudar de classe' : 'membros com idade para mudar de classe', href: '/admin?tab=members' },
    { show: birthdaysToday.length > 0, icon: PartyPopper, tone: 'bg-pink-500', count: birthdaysToday.length, label: `faz${birthdaysToday.length === 1 ? '' : 'em'} anos hoje: ${birthdaysToday.map(b => b.full_name?.split(' ')[0]).join(', ')}`, href: '/admin?tab=members' },
  ].filter(a => a.show)

  const kpis = [
    { icon: Users, label: 'Membros', value: totalMembers.toLocaleString('pt-PT'), sub: `${scouts.length} desbravadores · ${leaders} líderes`, tone: 'from-blue-500 to-blue-700' },
    { icon: ShieldCheck, label: 'Investidos', value: `${investmentRate}%`, sub: `${investedMembers} de ${totalMembers}`, tone: 'from-emerald-500 to-emerald-700' },
    { icon: Activity, label: 'Presença média', value: avgAttendance === null ? '—' : `${avgAttendance}%`, sub: attendanceMap.size ? `últimos ${attendanceMap.size} eventos` : 'sem eventos concluídos', tone: 'from-teal-500 to-cyan-700' },
    { icon: CalendarClock, label: 'Próximos eventos', value: upcomingEvents.length, sub: nextEvent ? `${relativeDayLabel(daysUntil(nextEvent.start_at, now))}: ${nextEvent.title}` : 'nada agendado', tone: 'from-indigo-500 to-violet-700' },
    { icon: Trophy, label: 'XP do clube', value: totalXP.toLocaleString('pt-PT'), sub: `média ${avgXP.toLocaleString('pt-PT')} por membro`, tone: 'from-purple-500 to-fuchsia-700' },
    { icon: Coins, label: 'Gold em circulação', value: totalGold.toLocaleString('pt-PT'), sub: `1 € ≈ ${goldRate.toLocaleString('pt-PT')} Gold`, tone: 'from-amber-400 to-orange-600' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho + números principais ───────────────────────── */}
      <section className="relative overflow-hidden rounded-[2rem] bg-blue-950 p-5 text-white shadow-xl shadow-blue-950/20 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(45% 70% at 100% 0%, rgba(250,204,21,.18), transparent 70%), radial-gradient(40% 60% at 0% 100%, rgba(99,102,241,.3), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-yellow-300">Visão geral do clube</p>
            <h2 className={`${D} mt-1 text-3xl font-extrabold leading-none sm:text-4xl`}>
              {new Date(now).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })}
            </h2>
          </div>
          {newMembers30 > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold ring-1 ring-inset ring-white/15">
              <UserPlus className="h-4 w-4 text-yellow-300" /> {newMembers30} {newMembers30 === 1 ? 'novo membro' : 'novos membros'} este mês
            </span>
          )}
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map(k => (
            <div key={k.label} className="relative overflow-hidden rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-blue-100/70">{k.label}</p>
              <p className={`${D} text-2xl font-extrabold leading-tight sm:text-3xl`}>{k.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-blue-100/60" title={k.sub}>{k.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Precisa de atenção ───────────────────────────────────── */}
      <Panel icon={AlertTriangle} iconClass="bg-amber-500" title="Precisa de atenção" subtitle="O que está pendente, por ordem de importância.">
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <Sparkles className="h-5 w-5 shrink-0" />
            <p className="font-bold">Está tudo em dia! Não há nada pendente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {attention.map(a => (
              <Link
                key={a.label}
                href={a.href}
                className="group flex items-center gap-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200 transition-all hover:bg-white hover:shadow-md hover:ring-stone-300"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${a.tone}`}>
                  <a.icon className="h-5 w-5" />
                </span>
                <p className="min-w-0 flex-1 text-sm text-stone-600">
                  <span className={`${D} mr-1 text-xl font-extrabold text-blue-950`}>{a.count}</span>
                  {a.label}
                </p>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-950" />
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Classes ──────────────────────────────────────────────── */}
      <Panel icon={Layers} iconClass="bg-blue-600" title="Classes" subtitle="Comparação rápida entre as classes do clube.">
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                <th className="pb-3 font-extrabold">Classe</th>
                <th className="pb-3 font-extrabold">Membros</th>
                <th className="pb-3 font-extrabold">Investidos</th>
                <th className="pb-3 text-right font-extrabold">XP médio</th>
                <th className="pb-3 text-right font-extrabold">Gold</th>
                <th className="pb-3 pl-6 font-extrabold">Presença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sections.map(s => {
                const invPct = s.count ? Math.round((s.invested / s.count) * 100) : 0
                const rc = rateColor(s.attendance)
                return (
                  <tr key={s.key}>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2 font-bold text-blue-950">
                        <span className={`h-3 w-3 rounded-full ${SECTION_SOLID[s.key]}`} /> {s.label}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 font-extrabold text-blue-950">{s.count}</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                          <div className={`h-full rounded-full ${SECTION_SOLID[s.key]}`} style={{ width: `${(s.count / maxSectionCount) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-stone-600">
                      <span className="font-bold text-blue-950">{s.invested}</span>/{s.count}
                      <span className="ml-1.5 text-xs text-stone-400">({invPct}%)</span>
                    </td>
                    <td className="py-3 pr-3 text-right font-bold text-indigo-600">{s.avgXP.toLocaleString('pt-PT')}</td>
                    <td className="py-3 pr-3 text-right font-bold text-amber-600">{s.gold.toLocaleString('pt-PT')}</td>
                    <td className="py-3 pl-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-100">
                          <div className={`h-full rounded-full ${rc.bar}`} style={{ width: `${s.attendance ?? 0}%` }} />
                        </div>
                        <span className={`w-10 text-xs font-extrabold ${rc.text}`}>{s.attendance === null ? '—' : `${s.attendance}%`}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-stone-400">
          Presença calculada nos últimos {attendanceMap.size || 0} eventos concluídos (presentes + atrasados).
        </p>
      </Panel>

      {/* ── Presença + agenda + aniversários ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          icon={Activity}
          iconClass="bg-teal-500"
          title="Presença nos últimos eventos"
          subtitle={avgAttendance === null ? 'Ainda não há eventos concluídos com presenças.' : `Média de ${avgAttendance}% nos últimos ${finishedWithStats.length} eventos.`}
        >
          {finishedWithStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Quando fechares as presenças de um evento, aparece aqui.</p>
          ) : (
            <div className="flex h-56 items-end gap-2 sm:gap-3">
              {finishedWithStats.map(e => {
                const s = attendanceMap.get(e.id)!
                const rc = rateColor(s.rate)
                const parts = fmtParts(e.start_at)
                return (
                  <div key={e.id} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${e.title} — ${s.present} presentes, ${s.late} atrasados, ${s.absent} faltas`}>
                    <span className={`text-xs font-extrabold ${rc.text}`}>{s.rate}%</span>
                    <div className="flex w-full flex-1 items-end overflow-hidden rounded-xl bg-stone-100">
                      <div className={`w-full rounded-xl ${rc.bar} transition-all group-hover:opacity-80`} style={{ height: `${Math.max(4, s.rate ?? 0)}%` }} />
                    </div>
                    <span className="w-full truncate text-center text-[10px] font-bold text-stone-500">{parts.day} {parts.month}</span>
                    <span className="w-full truncate text-center text-[10px] text-stone-400">{e.title}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel icon={CalendarDays} iconClass="bg-indigo-500" title="Agenda" action={<PanelLink href="/admin?tab=events">Eventos</PanelLink>}>
            {upcomingEvents.length === 0 ? (
              <p className="py-3 text-center text-sm text-stone-400">Sem eventos agendados.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcomingEvents.slice(0, 4).map(e => {
                  const p = fmtParts(e.start_at)
                  const d = daysUntil(e.start_at, now)
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <div className="w-11 shrink-0 overflow-hidden rounded-xl bg-white text-center ring-1 ring-stone-200">
                        <div className="bg-red-500 text-[9px] font-extrabold uppercase text-white">{p.month}</div>
                        <div className={`${D} text-lg font-extrabold leading-tight text-blue-950`}>{p.day}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-blue-950">{e.title}</p>
                        <p className="text-[11px] text-stone-400">{p.weekday} · {p.time} · {e.target_section ? SECTION_LABELS[e.target_section] : 'Todos'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${d <= 3 ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {relativeDayLabel(d)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel icon={Cake} iconClass="bg-pink-500" title="Aniversários" action={<span className="text-[11px] font-bold text-stone-400">30 dias</span>}>
            {birthdays.length === 0 ? (
              <p className="py-3 text-center text-sm text-stone-400">Sem aniversários próximos.</p>
            ) : (
              <ul className="space-y-2">
                {birthdays.slice(0, 5).map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-extrabold text-pink-600">
                        {m.full_name?.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-blue-950">{m.full_name}</p>
                        <p className="text-[11px] text-stone-400">{SECTION_LABELS[m.section]} · faz {m.age}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-extrabold text-pink-600">{m.daysUntil === 0 ? 'Hoje! 🎂' : relativeDayLabel(m.daysUntil)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Tarefas + top XP + por investir ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel icon={ListChecks} iconClass="bg-orange-500" title="Tarefas" action={<PanelLink href="/admin?tab=tasks">Gerir</PanelLink>}>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Ativas" value={activeTasks.length} />
            <MiniStat label="Por aprovar" value={pendingApprovals.length} highlight={pendingApprovals.length > 0} />
            <MiniStat label="Feitas (30d)" value={completions30} />
          </div>
          {pendingApprovals.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {pendingApprovals.slice(0, 4).map(c => (
                <li key={c.id} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <span className="truncate font-bold text-blue-950">{c.profiles?.full_name}</span>
                  <span className="truncate text-stone-400">· {c.tasks?.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={Trophy} iconClass="bg-yellow-500" title="Melhores XP" action={<PanelLink href="/leaderboard">Ranking</PanelLink>}>
          <ol className="space-y-3">
            {topPerformers.map((m, idx) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  idx === 0 ? 'bg-yellow-400 text-blue-950' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-200 text-orange-800' : 'bg-stone-100 text-stone-400'
                }`}>
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="truncate pr-2 text-sm font-bold text-blue-950">{m.full_name}</span>
                    <span className="shrink-0 text-xs font-extrabold text-indigo-600">{(m.total_xp || 0).toLocaleString('pt-PT')}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500" style={{ width: `${((m.total_xp || 0) / (topPerformers[0]?.total_xp || 1)) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          icon={ShieldCheck}
          iconClass="bg-emerald-500"
          title="Por investir"
          action={<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-700">{notInvested.length}</span>}
        >
          {notInvested.length === 0 ? (
            <p className="py-3 text-center text-sm text-stone-400">Todos os membros estão investidos! 🎉</p>
          ) : (
            <ul className="space-y-2">
              {notInvested.slice(0, 6).map(m => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-blue-950">{m.full_name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase text-white ${SECTION_SOLID[m.section] || 'bg-stone-400'}`}>
                    {SECTION_LABELS[m.section]}
                  </span>
                </li>
              ))}
              {notInvested.length > 6 && (
                <li><PanelLink href="/admin?tab=members">+{notInvested.length - 6} outros</PanelLink></li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Loja: encomendas + economia ─────────────────────────── */}
      {canManageStore && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel
          className="xl:col-span-2"
          icon={Package}
          iconClass="bg-orange-500"
          title="Encomendas pendentes"
          action={
            <div className="flex items-center gap-1.5">
              {unpaidOrders.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">{unpaidOrders.length} por pagar</span>}
              {paidUndelivered.length > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">{paidUndelivered.length} por entregar</span>}
            </div>
          }
        >
          {pendingList.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-400">Não há encomendas pendentes. 🙌</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {pendingList.map(p => {
                const isPaid = !!p.paid_at
                const buyer = p.profiles?.full_name || p.buyer_name || 'Desconhecido'
                const buyerSub = p.profiles ? SECTION_LABELS[p.profiles?.section] || p.profiles?.section : 'Convidado'
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isPaid ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
                        {isPaid ? <Package className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-blue-950">
                          {p.store_products?.name}{(p.quantity || 1) > 1 && ` × ${p.quantity}`}
                        </p>
                        <p className="truncate text-[11px] text-stone-500">
                          {buyer} • {buyerSub}
                          {Number(p.amount_due_eur) > 0 && (
                            <span className={`ml-1 font-extrabold ${isPaid ? 'text-stone-400' : 'text-rose-600'}`}>
                              {isPaid ? 'pago' : formatEur(Number(p.amount_due_eur))}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-[11px] font-extrabold uppercase transition-colors disabled:opacity-50 ${
                        isPaid ? 'text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50' : 'text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50'
                      }`}
                      onClick={() => (isPaid ? handleDeliverOnly(p.id) : handlePayAndDeliver(p.id))}
                      disabled={loading === p.id}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {loading === p.id ? '...' : isPaid ? 'Entregar' : 'Pago + Entregue'}
                    </button>
                  </div>
                )
              })}
              {pendingOrders.length > 5 && (
                <div className="pt-3 text-center">
                  <PanelLink href="/admin?tab=store">Ver todas as encomendas</PanelLink>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          className="xl:col-span-3"
          icon={Tag}
          iconClass="bg-blue-600"
          title="Loja · Economia & Níveis"
          subtitle="Preços fixos em € · o Gold dá desconto a uma taxa que sobe e desce com o Gold em circulação."
          action={<PanelLink href="/admin?tab=store">Gerir loja</PanelLink>}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <EconomyStat icon={<Gauge className="h-4 w-4" />} label="Taxa Gold" value={`1 € ≈ ${goldRate.toLocaleString('pt-PT')}`}
              sub={`×${rateInfo?.multiplier ?? 1} · ${(Number(rateInfo?.total_gold) || 0).toLocaleString('pt-PT')} em circulação`} color="amber" />
            <EconomyStat icon={<Banknote className="h-4 w-4" />} label="Por cobrar" value={formatEur(cashToCollect)} sub={`${unpaidOrders.length} por pagar`} color="rose" />
            <EconomyStat icon={<Wallet className="h-4 w-4" />} label="Recebido" value={formatEur(cashCollected)} sub="em vendas já pagas" color="emerald" />
            <EconomyStat icon={<Coins className="h-4 w-4" />} label="Descontos" value={formatEur(discountsGiven)} sub={`${goldSpent.toLocaleString('pt-PT')} Gold gastos`} color="blue" />
          </div>

          <details className="group mt-5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              Ver poder de desconto e membros por nível
            </summary>
            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-2.5">
                <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-stone-500">
                  <Coins className="h-4 w-4 text-amber-500" /> Poder de desconto dos membros
                </h4>
                <div className="space-y-2">
                  {priceTiers.map(tier => {
                    const reach = goldN > 0 ? Math.round((affordCount(tier.value) / goldN) * 100) : 0
                    return (
                      <div key={tier.key} className="flex items-center gap-3 rounded-xl bg-stone-50 p-2.5">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tier.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-blue-950">{tier.label} · {tier.value.toLocaleString('pt-PT')} Gold</p>
                          <p className="text-[10px] text-stone-400">{reach}% têm este saldo ou mais</p>
                        </div>
                        <span className={`shrink-0 text-sm font-extrabold ${tier.text}`}>≈ −{formatEur(tier.value / goldRate)}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] leading-relaxed text-stone-400">
                  Gold médio: <span className="font-bold text-stone-600">{avgGold.toLocaleString('pt-PT')}</span> (≈ −{formatEur(avgGold / goldRate)}) · ganho ≈ <span className="font-bold text-stone-600">{(monthlyIncome || avgGoldPerEvent).toLocaleString('pt-PT')}/mês</span>. Usa isto para calibrar a % de desconto máximo dos artigos.
                </p>
              </div>
              <div className="space-y-2.5">
                <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-stone-500">
                  <Layers className="h-4 w-4 text-indigo-500" /> Membros por nível
                </h4>
                <div className="space-y-2.5">
                  {levelBuckets.map(b => (
                    <div key={b.lvl} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-stone-600">Nível {b.label}</span>
                        <span className="font-bold text-blue-950">{b.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-stone-400">
                  Cada nível = 1000 XP. Pôr um artigo a <span className="font-bold text-indigo-500">Nível 3+</span> deixa-o disponível para {levelBuckets[2]?.atOrAbove ?? 0} membro(s).
                </p>
              </div>
            </div>
          </details>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-stone-100 pt-3 text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-rose-500" /><b className="text-blue-950">{unpaidOrders.length}</b> por pagar</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-blue-500" /><b className="text-blue-950">{paidUndelivered.length}</b> por entregar</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /><b className="text-blue-950">{deliveredCount}</b> entregues</span>
            <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-stone-400" /><b className="text-blue-950">{itemsSold}</b> vendas</span>
          </div>
        </Panel>
      </div>
      )}
    </div>
  )
}

function Panel({ icon: Icon, iconClass, title, subtitle, action, children, className = '' }: {
  icon: React.ElementType
  iconClass: string
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className={`${D} text-lg font-extrabold leading-tight text-blue-950 sm:text-xl`}>{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-700 hover:underline">
      {children} <ChevronRight className="h-3 w-3" />
    </Link>
  )
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${highlight ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'bg-stone-50'}`}>
      <p className={`${D} text-2xl font-extrabold leading-none ${highlight ? 'text-orange-600' : 'text-blue-950'}`}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  )
}

function EconomyStat({ icon, label, value, sub, color }: { icon: React.ReactNode, label: string, value: number | string, sub?: string, color: 'blue' | 'emerald' | 'rose' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <div className={`shrink-0 rounded-lg p-1.5 ${colors[color]}`}>{icon}</div>
        <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-stone-500">{label}</span>
      </div>
      <p className={`${D} truncate text-lg font-extrabold text-blue-950 sm:text-xl`}>
        {typeof value === 'number' ? value.toLocaleString('pt-PT') : value}
      </p>
      {sub && <p className="truncate text-[10px] text-stone-400">{sub}</p>}
    </div>
  )
}
