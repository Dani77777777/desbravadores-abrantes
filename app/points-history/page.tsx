import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Coins, ArrowLeft, Calendar } from 'lucide-react'
import Link from 'next/link'

export default async function PointsHistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  const { data: pointsLog } = await supabase
    .from('points_log')
    .select('*')
    .eq('target_user_id', user.id)
    .order('created_at', { ascending: false })

  const totalXp = pointsLog?.reduce((sum, entry) => sum + (entry.amount_xp || 0), 0) ?? 0
  const totalGold = pointsLog?.reduce((sum, entry) => sum + (entry.amount_gold || 0), 0) ?? 0

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Painel
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Histórico de Pontos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Todos os pontos e moedas recebidos, {profile.full_name}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-indigo-100">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-full text-indigo-700">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">XP Total Ganho</p>
                  <p className="text-2xl font-bold text-indigo-700">{totalXp} XP</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-100">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-full text-yellow-700">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Gold Total Ganho</p>
                  <p className="text-2xl font-bold text-yellow-700">{totalGold} 🪙</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Log entries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registo de Atividade</CardTitle>
            <CardDescription>
              {pointsLog?.length ?? 0} entradas no histórico
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pointsLog && pointsLog.length > 0 ? (
              pointsLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-100 hover:border-stone-200 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{entry.description}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(entry.created_at).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    {entry.amount_xp !== 0 && (
                      <Badge
                        variant="secondary"
                        className={`${
                          entry.amount_xp > 0
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-red-100 text-red-700'
                        } font-semibold`}
                      >
                        {entry.amount_xp > 0 ? '+' : ''}{entry.amount_xp} XP
                      </Badge>
                    )}
                    {entry.amount_gold !== 0 && (
                      <Badge
                        variant="secondary"
                        className={`${
                          entry.amount_gold > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        } font-semibold`}
                      >
                        {entry.amount_gold > 0 ? '+' : ''}{entry.amount_gold} 🪙
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Ainda não há pontos registados.</p>
                <p className="text-xs mt-1">Participa nas atividades para ganhar XP e Gold!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
