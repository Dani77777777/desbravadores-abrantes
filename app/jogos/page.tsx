import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Sparkles, Sword, Trophy } from 'lucide-react';
import Link from 'next/link';

export default async function GamesHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const games = [
    {
      id: 'vantur',
      title: 'VANTUR',
      description: 'O clássico jogo de adivinhar palavras bíblicas. Solo, Mix ou Plex!',
      icon: <img src="/images/vantur.png" alt="Vantur" className="w-12 h-12 object-contain" />,
      href: '/jogos/vantur',
      color: 'from-amber-400 to-orange-600',
      status: 'Disponível'
    },
    {
      id: 'em-breve',
      title: 'Em Breve...',
      description: 'Mais desafios estão a ser preparados pelos teus líderes!',
      icon: <Sword className="w-10 h-10 text-gray-400" />,
      href: '#',
      color: 'from-gray-500 to-gray-600',
      status: 'Bloqueado'
    }
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <Gamepad2 className="w-10 h-10 text-blue-600" /> Centro de Jogos
            </h1>
            <p className="text-lg text-gray-600">Treina a tua mente e diverte-te enquanto ganhas XP e Gold!</p>
          </div>
          
          <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-xl text-yellow-700">
               <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">O Teu Progresso</p>
              <p className="text-lg font-bold text-gray-900">{profile?.total_xp} XP Total</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {games.map((game) => (
            <Card key={game.id} className="group overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300">
              <div className={`h-32 bg-gradient-to-br ${game.color} p-6 flex items-center justify-center relative overflow-hidden`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-150 transition-transform duration-500">
                  {game.icon}
                </div>
                <div className="z-10 bg-white p-4 rounded-2xl shadow-xl transform group-hover:rotate-6 transition-transform">
                  {game.icon}
                </div>
              </div>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-2xl font-bold">{game.title}</CardTitle>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${game.status === 'Disponível' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {game.status}
                  </span>
                </div>
                <CardDescription className="text-gray-600 min-h-[3rem]">
                  {game.description}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                 <Link href={game.href} className="w-full">
                    <Button 
                      className="w-full py-6 rounded-xl font-bold text-lg" 
                      disabled={game.status !== 'Disponível'}
                      variant={game.status === 'Disponível' ? 'default' : 'secondary'}
                    >
                      {game.status === 'Disponível' ? 'Jogar Agora' : 'Em Breve'}
                    </Button>
                 </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
