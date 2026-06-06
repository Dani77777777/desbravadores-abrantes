'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { 
  Users, 
  ShieldCheck, 
  Trophy, 
  Coins, 
  Cake, 
  BarChart3, 
  ChevronRight,
  TrendingUp,
  CalendarDays,
  MapPin,
  Package,
  Check
} from 'lucide-react'

interface OverviewPanelProps {
  profile: any
  members: any[]
  events: any[]
  purchases: any[]
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

const SECTION_COLORS: Record<string, string> = {
  rebentos: 'bg-emerald-100 text-emerald-700',
  ticoes: 'bg-blue-100 text-blue-700',
  exploradores: 'bg-purple-100 text-purple-700',
  companheiros: 'bg-amber-100 text-amber-700',
  embaixadores: 'bg-rose-100 text-rose-700',
}

export function OverviewPanel({ profile, members, events, purchases }: OverviewPanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const isCoordenador = profile.role === 'coordenador'
  const targetSection = profile.leadership_section || profile.section

  // 1. Stats
  const totalMembers = members.length
  const investedMembers = members.filter(m => m.is_invested).length
  const totalXP = members.reduce((acc, m) => acc + (m.total_xp || 0), 0)
  const totalGold = members.reduce((acc, m) => acc + (m.current_gold || 0), 0)
  const investmentRate = totalMembers > 0 ? Math.round((investedMembers / totalMembers) * 100) : 0

  // 2. Section Distribution
  const distribution = Object.keys(SECTION_LABELS).map(key => ({
    key,
    label: SECTION_LABELS[key],
    count: members.filter(m => m.section === key).length
  }))

  // 3. Upcoming Birthdays (Next 30 days)
  const today = new Date()
  const next30DaysBirthdays = members
    .filter(m => m.birth_date)
    .map(m => {
      const bDate = new Date(m.birth_date)
      const bMonth = bDate.getUTCMonth()
      const bDay = bDate.getUTCDate()
      
      let nextBday = new Date(today.getFullYear(), bMonth, bDay)
      if (nextBday < today && (nextBday.toDateString() !== today.toDateString())) {
        nextBday.setFullYear(today.getFullYear() + 1)
      }
      
      const diffTime = nextBday.getTime() - today.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      
      return { ...m, daysUntil: diffDays, nextBday }
    })
    .filter(m => m.daysUntil >= 0 && m.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5)

  // 4. Top Performers (by XP)
  const topPerformers = [...members]
    .sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0))
    .slice(0, 5)

  // 5. Upcoming Events
  const upcomingEvents = events
    .filter(e => !e.is_finished && new Date(e.start_at) >= today)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(0, 3)

  // 6. Pending Deliveries (Physical and Pending status)
  const pendingDeliveries = purchases
    .filter(p => p.store_products?.type === 'physical' && p.status === 'pending')
    .slice(0, 5)

  const handleDeliver = async (purchaseId: string) => {
    setLoading(purchaseId)
    try {
      const { error } = await supabase
        .from('store_purchases')
        .update({ status: 'delivered', updated_at: new Date().toISOString() })
        .eq('id', purchaseId)
      
      if (error) throw error
      
      toast.success('Artigo marcado como entregue!')
      router.refresh()
    } catch (error: any) {
      toast.error('Erro ao marcar entrega.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard 
          icon={<Users className="w-5 h-5" />} 
          label="Membros" 
          value={totalMembers} 
          color="blue"
        />
        <StatCard 
          icon={<ShieldCheck className="w-5 h-5" />} 
          label="Investidos" 
          value={`${investmentRate}%`} 
          color="emerald"
        />
        <StatCard 
          icon={<Trophy className="w-5 h-5" />} 
          label="Total XP" 
          value={totalXP.toLocaleString()} 
          color="purple"
        />
        <StatCard 
          icon={<Coins className="w-5 h-5" />} 
          label="Total Ouro" 
          value={totalGold.toLocaleString()} 
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub-grid for Birthdays and Events */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Birthdays */}
            <Card className="h-full">
              <CardHeader className="pb-3 px-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                    <Cake className="w-5 h-5 text-pink-500" />
                    Aniversários
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">30 dias</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {next30DaysBirthdays.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sem aniversários próximos.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {next30DaysBirthdays.map(m => (
                      <div key={m.id} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 font-bold text-[10px] shrink-0">
                            {m.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{m.full_name}</p>
                            <p className="text-[9px] text-gray-400 capitalize">{m.section}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-[10px] font-bold text-pink-600">
                            {m.daysUntil === 0 ? 'Hoje! 🎂' : `Em ${m.daysUntil}d`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="h-full">
              <CardHeader className="pb-3 px-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-indigo-600" />
                    Agenda
                  </CardTitle>
                  <Badge variant="outline" className="text-[9px]">Eventos</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sem eventos agendados.</p>
                ) : (
                  <div className="relative border-l-2 border-indigo-200 ml-1 space-y-5 pb-1">
                    {upcomingEvents.map(event => {
                      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
                      const daysLeft = Math.ceil((new Date(event.start_at).getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24))
                      const daysLabel = daysLeft === 0 ? 'Hoje' : daysLeft === 1 ? 'Amanhã' : `Em ${daysLeft}d`
                      const isUrgent = daysLeft <= 3
                      return (
                        <div key={event.id} className="relative pl-4 py-0.5">
                          <div className={`absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isUrgent ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-gray-800 line-clamp-1 flex-1">{event.title}</p>
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${isUrgent ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                              {daysLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                            <CalendarDays className="w-3 h-3" />
                            <span>
                              {new Date(event.start_at).toLocaleDateString('pt-PT', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* Members per Investiture Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  Membros Por Investir
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {members.filter(m => !m.is_invested).length} Pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {members.filter(m => !m.is_invested).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Todos os membros estão investidos! 🎉</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {members.filter(m => !m.is_invested).map(m => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-[10px]">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-gray-700">{m.full_name}</span>
                      </div>
                      <Badge variant="secondary" className={`text-[9px] capitalize ${SECTION_COLORS[m.section]}`}>
                        {SECTION_LABELS[m.section]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Deliveries Widget */}
          <Card>
            <CardHeader className="pb-3 text-left">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  Entregas Pendentes
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                  {purchases.filter(p => p.store_products?.type === 'physical' && p.status === 'pending').length} Pedidos
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingDeliveries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Não há entregas físicas pendentes. 🙌</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingDeliveries.map(p => (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-bold text-gray-800 truncate">{p.store_products?.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {p.profiles?.full_name} • {SECTION_LABELS[p.profiles?.section] || p.profiles?.section}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-[10px] font-black uppercase text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0 gap-1.5"
                        onClick={() => handleDeliver(p.id)}
                        disabled={loading === p.id}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {loading === p.id ? '...' : 'Entregar'}
                      </Button>
                    </div>
                  ))}
                  {purchases.filter(p => p.store_products?.type === 'physical' && p.status === 'pending').length > 5 && (
                    <div className="pt-2 text-center">
                      <a href="/admin?tab=store" className="text-[10px] font-bold text-blue-600 hover:underline px-2 py-1">
                        Ver todas as encomendas...
                      </a>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Top Performers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Melhores XP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPerformers.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      idx === 0 ? 'bg-yellow-100 text-yellow-700' : 
                      idx === 1 ? 'bg-slate-100 text-slate-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-800 truncate pr-2">{m.full_name}</span>
                        <span className="text-xs font-bold text-blue-700 shrink-0">{m.total_xp.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${(m.total_xp / (topPerformers[0].total_xp || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section Distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Classes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {distribution.map(item => (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className="font-bold">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.key === 'rebentos' ? 'bg-emerald-500' :
                          item.key === 'ticoes' ? 'bg-blue-500' :
                          item.key === 'exploradores' ? 'bg-purple-500' :
                          item.key === 'companheiros' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${totalMembers > 0 ? (item.count / totalMembers) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-600 italic">Investidura</span>
                    <span className="font-bold text-emerald-600">{investmentRate}%</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-600 italic">Média XP</span>
                    <span className="font-bold text-blue-600">
                      {totalMembers > 0 ? Math.round(totalXP / totalMembers).toLocaleString() : 0}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: 'blue' | 'emerald' | 'purple' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  }

  return (
    <Card className="border shadow-sm bg-white overflow-hidden group">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2 sm:gap-4">
          <div className={`p-2 rounded-xl border ${colors[color]} shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{label}</p>
            <p className="text-sm sm:text-xl font-black text-gray-900 truncate">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
