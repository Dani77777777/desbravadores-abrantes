import { createClient } from '@/utils/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Card, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Sword, Trophy, Lock, LogIn } from 'lucide-react';
import Link from 'next/link';

export default async function GamesHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    profile = data;
  }

  // requiresAuth: true  → jogar precisa de login
  // requiresAuth: false → pode jogar sem login (convidado)
  const games = [
    {
      id: 'vantur',
      title: 'VANTUR',
      description: 'O clássico jogo de adivinhar palavras bíblicas. Solo, Mix ou Plex!',
      icon: <img src="/images/vantur.png" alt="Vantur" className="w-12 h-12 object-contain" />,
      href: '/jogos/vantur',
      loginHref: '/login?redirect=/jogos/vantur',
      color: 'from-amber-400 to-orange-600',
      status: 'Disponível',
      requiresAuth: true,
    },
    {
      id: 'vana-quest',
      title: 'VanaQuest',
      description: 'Quiz em tempo real ao estilo Kahoot! Responde rápido, acumula pontos e sobe ao pódio.',
      icon: <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-12 h-12 object-contain" />,
      href: '/jogos/vana-quest',
      loginHref: '/jogos/vana-quest',
      color: 'from-blue-700 via-blue-900 to-yellow-500',
      status: 'Disponível',
      requiresAuth: false,
    },
    {
      id: 'vana-words',
      title: 'VanaWords',
      description: 'Jogo de palavras secretas ao estilo Codenames! Guia a tua equipa com dicas e descobre as palavras certas.',
      icon: <img src="/images/VanaWords.png" alt="VanaWords" className="w-12 h-12 object-contain" />,
      href: '/jogos/vana-words',
      loginHref: '/login?redirect=/jogos/vana-words',
      color: 'from-emerald-600 via-teal-700 to-indigo-800',
      status: 'Disponível',
      requiresAuth: true,
    },
    {
      id: 'vana-sketch',
      title: 'VanaSketch',
      description: 'Pictionary bíblico! Um desenha no telemóvel, o desenho aparece no projetor e os outros adivinham.',
      icon: <img src="/images/VanaSketch.png" alt="VanaSketch" className="w-12 h-12 object-contain" />,
      href: '/jogos/vana-sketch',
      loginHref: '/login?redirect=/jogos/vana-sketch',
      color: 'from-pink-500 via-rose-600 to-indigo-800',
      status: 'Disponível',
      requiresAuth: true,
    },
    {
      id: 'em-breve',
      title: 'Em Breve...',
      description: 'Mais desafios estão a ser preparados pelos teus líderes!',
      icon: <Sword className="w-10 h-10 text-gray-400" />,
      href: '#',
      loginHref: '#',
      color: 'from-gray-500 to-gray-600',
      status: 'Bloqueado',
      requiresAuth: false,
    },
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

          {user ? (
            <div className="bg-white p-4 rounded-2xl shadow-sm border flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-xl text-yellow-700">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">O Teu Progresso</p>
                <p className="text-lg font-bold text-gray-900">{profile?.total_xp ?? 0} XP Total</p>
              </div>
            </div>
          ) : (
            <Link href="/login">
              <Button variant="outline" className="flex items-center gap-2 rounded-xl">
                <LogIn className="w-4 h-4" /> Fazer login para ganhar XP e Gold
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {games.map((game) => {
            const isAvailable = game.status === 'Disponível';
            const needsLogin = isAvailable && game.requiresAuth && !user;
            const destination = needsLogin ? game.loginHref : game.href;

            return (
              <Card key={game.id} className="group overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col">
                <div className={`h-32 bg-gradient-to-br ${game.color} p-6 flex items-center justify-center relative overflow-hidden`}>
                  {needsLogin && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-20">
                      <Lock className="w-8 h-8 text-white/80" />
                    </div>
                  )}
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-150 transition-transform duration-500">
                    {game.icon}
                  </div>
                  <div className="z-10 bg-white p-4 rounded-2xl shadow-xl transform group-hover:rotate-6 transition-transform">
                    {game.icon}
                  </div>
                </div>

                <CardHeader className="flex-1">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-2xl font-bold">{game.title}</CardTitle>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                      isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {game.status}
                    </span>
                  </div>
                  <CardDescription className="text-gray-600 min-h-[3rem]">
                    {game.description}
                  </CardDescription>
                  {needsLogin && (
                    <p className="text-xs text-amber-600 font-semibold flex items-center gap-1 mt-1">
                      <Lock className="w-3 h-3" /> Requer conta para jogar
                    </p>
                  )}
                </CardHeader>

                <CardFooter>
                  <Link href={isAvailable ? destination : '#'} className="w-full">
                    <Button
                      className="w-full py-6 rounded-xl font-bold text-lg"
                      disabled={!isAvailable}
                      variant={isAvailable ? 'default' : 'secondary'}
                    >
                      {!isAvailable
                        ? 'Em Breve'
                        : needsLogin
                          ? <span className="flex items-center gap-2"><LogIn className="w-4 h-4" /> Fazer Login</span>
                          : 'Jogar Agora'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
