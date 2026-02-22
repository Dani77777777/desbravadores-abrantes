'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  ShieldCheck, 
  Trophy, 
  Coins, 
  Cake, 
  BarChart3, 
  ChevronRight,
  TrendingUp
} from 'lucide-react'

interface OverviewPanelProps {
  profile: any
  members: any[]
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

export function OverviewPanel({ profile, members }: OverviewPanelProps) {
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

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<Users className="w-5 h-5" />} 
          label="Membros Totais" 
          value={totalMembers} 
          color="blue"
        />
        <StatCard 
          icon={<ShieldCheck className="w-5 h-5" />} 
          label="Investidos" 
          value={`${investedMembers} (${investmentRate}%)`} 
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
        {/* Left Column: Birthdays & Top Performers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Birthdays */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Cake className="w-5 h-5 text-pink-500" />
                  Próximos Aniversários
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">Próximos 30 dias</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {next30DaysBirthdays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sem aniversários nos próximos 30 dias.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {next30DaysBirthdays.map(m => (
                    <div key={m.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 font-bold text-xs">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{m.full_name}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{SECTION_LABELS[m.section]}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-pink-600">
                          {m.daysUntil === 0 ? 'Hoje! 🎂' : `Em ${m.daysUntil} dias`}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(m.birth_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Performers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Membros com Mais XP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topPerformers.map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-4">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-yellow-100 text-yellow-700' : 
                      idx === 1 ? 'bg-slate-100 text-slate-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-800">{m.full_name}</span>
                        <span className="text-sm font-bold text-blue-700">{m.total_xp.toLocaleString()} XP</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
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

          {/* Non-Invested Members */}
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
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-[10px]">
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{m.full_name}</span>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] capitalize ${SECTION_COLORS[m.section]}`}>
                        {SECTION_LABELS[m.section]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Section Distribution */}
        <div className="space-y-6">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Distribuição por Classe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {distribution.map(item => (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className="font-bold">{item.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
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

              <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Resumo da Unidade</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Membros Ativos</span>
                    <span className="font-bold text-gray-900">{totalMembers}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Taxa de Investidura</span>
                    <span className="font-bold text-emerald-600">{investmentRate}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Média XP / Membro</span>
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
    <Card className="border-none shadow-sm bg-white overflow-hidden group">
      <div className={`absolute top-0 left-0 w-1 h-full ${
        color === 'blue' ? 'bg-blue-500' : 
        color === 'emerald' ? 'bg-emerald-500' : 
        color === 'purple' ? 'bg-purple-500' : 'bg-amber-500'
      }`} />
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-xl border ${colors[color]}`}>
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
