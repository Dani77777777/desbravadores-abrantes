import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { User, Trophy, Coins, Megaphone, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SECTION_COLORS = {
  rebentos: 'bg-green-500',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500', // Yellow/Green - simplified to Gold for now or custom gradient
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500', // Grey/Gold
}

const SECTION_LABELS = {
    rebentos: 'Rebentos',
    ticoes: 'Tições',
    exploradores: 'Exploradores',
    companheiros: 'Companheiros',
    embaixadores: 'Embaixadores'
}

export default async function Dashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
      // This should be handled by middleware, but for safety in dev
      return <div>Carregando...</div>
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Simplified fetching of recent announcements (mock logic for targeting needs more complex query or RLS)
  // For now, fetch all or targeted ones
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!profile) return <div>Perfil não encontrado.</div>

  const sectionColor = SECTION_COLORS[profile.section as keyof typeof SECTION_COLORS] || 'bg-green-600'
  const sectionLabel = SECTION_LABELS[profile.section as keyof typeof SECTION_LABELS] || profile.section

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Hero Section */}
        <Card className="overflow-hidden border-none shadow-md">
            <div className={`h-24 ${sectionColor} relative`}>
                {!profile.is_invested && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="destructive" className="bg-red-500/90 text-white hover:bg-red-600">
                      A aguardar investidura
                    </Badge>
                  </div>
                )}
            </div>
            <CardContent className="pt-0 relative px-6 pb-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-12 mb-4 gap-4">
                     <div className="relative">
                        <div className="w-24 h-24 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-sm">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500">
                                    <User className="h-10 w-10" />
                                </div>
                            )}
                        </div>
                        {profile.is_invested && (
                           <div className="absolute -bottom-2 -right-2 bg-yellow-400 p-1.5 rounded-full border-2 border-white shadow-sm" title="Investido">
                               <div className="w-4 h-4 bg-yellow-600 rounded-full" /> {/* Placeholder for scarf icon */}
                           </div>
                        )}
                     </div>
                     <div className="text-center sm:text-left flex-1">
                        <h1 className="text-2xl font-bold text-gray-900">{profile.full_name}</h1>
                        <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                            <Badge variant="secondary" className={`${sectionColor} text-white border-none capitalize`}>
                                {sectionLabel}
                            </Badge>
                            <Badge variant="outline" className="text-gray-600 capitalize">
                                {profile.role}
                            </Badge>
                        </div>
                     </div>
                </div>

                {/* Gamification Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="space-y-2">
                         <div className="flex justify-between items-center text-sm font-medium">
                            <div className="flex items-center gap-2 text-indigo-700">
                                <Trophy className="w-4 h-4" />
                                <span>Pontos de Experiência (XP)</span>
                            </div>
                            <span className="text-gray-600">{profile.total_xp} XP</span>
                         </div>
                         <Progress value={(profile.total_xp % 1000) / 10} className="h-3 bg-indigo-100" indicatorColor="bg-indigo-600" />
                         <p className="text-xs text-right text-gray-500">Próximo nível em {1000 - (profile.total_xp % 1000)} XP</p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded-full text-yellow-700">
                                <Coins className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-yellow-800 font-medium">Saldo Atual</p>
                                <p className="text-2xl font-bold text-yellow-900">{profile.current_gold}</p>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100">
                            Histórico
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Announcements Feed */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Megaphone className="w-5 h-5" /> Avisos e Novidades
                    </h2>
                </div>
                
                {announcements && announcements.length > 0 ? (
                    announcements.map((announcement) => (
                        <Card key={announcement.id} className="border-l-4 border-l-green-600 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="py-4">
                                <CardTitle className="text-base font-semibold">{announcement.title}</CardTitle>
                                <p className="text-xs text-gray-500">
                                   {new Date(announcement.created_at).toLocaleDateString('pt-PT')}
                                </p>
                            </CardHeader>
                            <CardContent className="py-2 pb-4 text-sm text-gray-600">
                                {announcement.message}
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-center py-10 bg-white rounded-lg border border-dashed border-gray-300">
                        <p className="text-gray-500">Sem avisos recentes.</p>
                    </div>
                )}
            </div>

            <div className="md:col-span-1">
                 {/* Quick Actions / Future standard sidebar */}
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Ações Rápidas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
                            <ScanLine className="mr-2 h-5 w-5" />
                            Ler QR Code
                        </Button>
                        {/* More buttons... */}
                    </CardContent>
                 </Card>
            </div>
        </div>

      </main>
    </div>
  )
}
