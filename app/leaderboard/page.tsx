import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Coins, Star, User, Medal, Crown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const SECTION_COLORS = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

const SECTION_LABELS = {
    rebentos: 'Rebentos',
    ticoes: 'Tições',
    exploradores: 'Exploradores',
    companheiros: 'Companheiros',
    embaixadores: 'Embaixadores'
}

async function getLeaderboardData() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
  
  if (error) {
    console.error('Error fetching leaderboard:', error)
    return []
  }
  return data || []
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  
  // Try to get current user for personal highlighting
  const { data: { user } } = await supabase.auth.getUser()
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  const allData = await getLeaderboardData()

  const xpRanking = [...allData].sort((a, b) => b.total_xp - a.total_xp)
  const goldRanking = [...allData].sort((a, b) => b.current_gold - a.current_gold)
  const combinedRanking = [...allData].sort((a, b) => b.combined_score - a.combined_score)

  const LeaderboardList = ({ data, type }: { data: any[], type: 'xp' | 'gold' | 'combined' }) => (
    <div className="space-y-3 mt-4">
      {data.map((member, index) => {
        const isTop3 = index < 3
        const isCurrentUser = user && member.id === user.id
        const score = type === 'xp' ? member.total_xp : type === 'gold' ? member.current_gold : member.combined_score
        const unit = type === 'xp' ? 'XP' : type === 'gold' ? 'Ouro' : 'Pontos'

        return (
          <div 
            key={member.id} 
            className={`flex items-center gap-4 p-4 rounded-xl transition-all border ${
              isCurrentUser 
                ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100' 
                : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <div className="flex items-center justify-center w-8 font-bold text-gray-400">
              {index === 0 ? <Crown className="w-6 h-6 text-yellow-500" /> : 
               index === 1 ? <Medal className="w-6 h-6 text-slate-400" /> : 
               index === 2 ? <Medal className="w-6 h-6 text-amber-600" /> : 
               index + 1}
            </div>

            <Avatar className="h-12 w-12 border-2 border-gray-100">
              <AvatarImage src={member.avatar_url} alt={member.full_name} className="object-cover" />
              <AvatarFallback className="bg-gray-100 text-gray-500 font-bold">
                {member.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold truncate ${isCurrentUser ? 'text-blue-900' : 'text-gray-900'}`}>
                  {member.full_name}
                </span>
                {isCurrentUser && <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 h-5 px-1.5 text-[10px]">TU</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 h-4 border-none text-white ${SECTION_COLORS[member.section as keyof typeof SECTION_COLORS]}`}>
                  {SECTION_LABELS[member.section as keyof typeof SECTION_LABELS]}
                </Badge>
                {member.is_invested && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Investido" />}
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-1 font-black text-lg">
                <span className={isTop3 ? 'text-gray-900' : 'text-gray-600'}>{score}</span>
                {type === 'xp' ? <Trophy className="w-4 h-4 text-indigo-500" /> : 
                 type === 'gold' ? <Coins className="w-4 h-4 text-yellow-500" /> : 
                 <Star className="w-4 h-4 text-amber-500" />}
              </div>
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{unit}</span>
            </div>
          </div>
        )
      })}

      {allData.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed">
          Nenhum membro encontrado no ranking.
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header className="text-center space-y-2">
           <h1 className="text-4xl font-black text-blue-900 tracking-tight flex items-center justify-center gap-3">
             <Trophy className="w-10 h-10 text-yellow-500" />
             LEADERBOARD
           </h1>
           <p className="text-gray-500 max-w-md mx-auto">
             Os melhores Desbravadores do nosso Clube. Esforça-te e conquista o teu lugar no topo!
           </p>
        </header>

        <section>
          <Tabs defaultValue="combined" className="w-full">
            <div className="flex justify-center mb-6">
              <TabsList className="bg-white border p-1 h-auto rounded-full shadow-sm">
                <TabsTrigger value="xp" className="rounded-full px-6 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all gap-2">
                  <Trophy className="w-4 h-4" /> <span className="hidden sm:inline">Ranking</span> XP
                </TabsTrigger>
                <TabsTrigger value="gold" className="rounded-full px-6 py-2 data-[state=active]:bg-yellow-500 data-[state=active]:text-white transition-all gap-2">
                  <Coins className="w-4 h-4" /> <span className="hidden sm:inline">Ranking</span> Ouro
                </TabsTrigger>
                <TabsTrigger value="combined" className="rounded-full px-6 py-2 data-[state=active]:bg-blue-900 data-[state=active]:text-white transition-all gap-2">
                  <Star className="w-4 h-4" /> <span className="hidden sm:inline">Top</span> Global
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="xp">
              <LeaderboardList data={xpRanking} type="xp" />
            </TabsContent>
            
            <TabsContent value="gold">
              <LeaderboardList data={goldRanking} type="gold" />
            </TabsContent>
            
            <TabsContent value="combined">
              <LeaderboardList data={combinedRanking} type="combined" />
            </TabsContent>
          </Tabs>
        </section>

        <footer className="text-center pt-8 border-t border-gray-200">
           <p className="text-xs text-gray-400 font-medium uppercase tracking-[0.2em]">
             Clube de Desbravadores de Abrantes • {new Date().getFullYear()}
           </p>
        </footer>
      </main>
    </div>
  )
}
