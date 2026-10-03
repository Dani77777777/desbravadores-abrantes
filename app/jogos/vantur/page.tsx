import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ChevronLeft, Brain, Zap, Layers } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import VanturGame from '@/components/vantur/VanturGame';
import VanturHowToPlay from '@/components/vantur/VanturHowToPlay';
import VanturReplayButton from '@/components/vantur/VanturReplayButton';
import type { VanturReplaySession } from '@/components/vantur/VanturReplay';
import { gameUnavailableError } from '@/utils/game-access';

interface ModeCardProps {
  title: string;
  description: string;
  mode: string;
  icon: React.ReactNode;
  userId: string;
  action: (formData: FormData) => Promise<void>;
  isFinished?: boolean;
  finishedSession?: VanturReplaySession;
}

function ModeCard({ title, description, mode, icon, userId, action, isFinished, finishedSession }: ModeCardProps) {
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center text-center gap-6 transition-all hover:shadow-xl hover:-translate-y-1 ${isFinished ? 'opacity-75 grayscale-[0.5]' : ''}`}>
      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-2 ${isFinished ? 'bg-slate-50' : 'bg-blue-50/50'}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-2xl font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
      </div>
      
      {isFinished ? (
        <div className="w-full flex flex-col gap-3">
          <div className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-bold cursor-not-allowed">
            CONCLUÍDO HOJE
          </div>
          {finishedSession && finishedSession.attempts.length > 0 && (
            <VanturReplayButton session={finishedSession} />
          )}
        </div>
      ) : (
        <form action={action} className="w-full">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="userId" value={userId} />
          <button 
            type="submit"
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            JOGAR
          </button>
        </form>
      )}
    </div>
  );
}

export default async function VanturGamePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Load all sessions updated today for this user
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const { data: sessions } = await supabase
    .from('vantur_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('updated_at', todayStart.toISOString());

  // Check which modes are finished or active
  const finishedSessions = (sessions || []).filter(s => s.is_finished);
  const finishedModes = finishedSessions.map(s => s.mode);
  const finishedSessionFor = (mode: string): VanturReplaySession | undefined => {
    const s = finishedSessions.find(f => f.mode === mode);
    return s ? { secret_words: s.secret_words, attempts: s.attempts ?? [], mode: s.mode } : undefined;
  };
  const activeSessions = (sessions || []).filter(s => !s.is_finished);

  async function startVantur(formData: FormData) {
    'use server'
    const modeVal = formData.get('mode') as string;
    const uId = formData.get('userId') as string;

    if (await gameUnavailableError('vantur')) redirect('/jogos/vantur');

    try {
      const supabaseAction = await (await import('@/utils/supabase/server')).createClient();
      
      const today = new Date();
      today.setHours(0,0,0,0);
      const { data: existing } = await supabaseAction
        .from('vantur_sessions')
        .select('is_finished')
        .eq('user_id', uId)
        .eq('mode', modeVal)
        .gte('created_at', today.toISOString())
        .single();
      
      if (existing?.is_finished) return;

      const wordCount = modeVal === 'solo' ? 1 : modeVal === 'mix' ? 2 : 4;
      let secretWords: string[] = [];
      
      // 1. Tentar obter do dicionário Vantur (Bíblico) via RPC (Aleatório Real)
      const { data: words } = await supabaseAction.rpc('get_random_vantur_words', { count: wordCount });
      
      if (words && words.length >= wordCount) {
        secretWords = words.map((w: any) => w.word);
      } else {
        // 2. Fallback: Se o dicionário Vantur falhar ou for pequeno, tenta o dicionário geral via RPC
        const { data: genWords } = await supabaseAction.rpc('get_random_general_words', { count: wordCount });
        if (genWords && genWords.length >= wordCount) {
          secretWords = genWords.map((w: any) => w.word_clean);
        }
      }

      await supabaseAction.from('vantur_sessions').upsert({
        user_id: uId,
        mode: modeVal,
        secret_words: secretWords,
        attempts: [],
        completed_indices: [],
        is_finished: false,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, mode' });

      revalidatePath('/jogos/vantur');
    } catch (error) {
      if ((error as any)?.digest?.includes('NEXT_REDIRECT')) throw error;
      console.error('Critical failure starting Vantur:', error);
    }
    
    redirect('/jogos/vantur');
  }

  const currentActiveSession = activeSessions.length > 0 ? activeSessions[0] : null;

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/jogos" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 mb-8 font-medium transition-colors group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Voltar ao Hub de Jogos
        </Link>

        {currentActiveSession ? (
          <VanturGame initialSession={currentActiveSession} userId={user.id} />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
            <div className="text-center space-y-3">
              <div className="mx-auto w-32 h-32 mb-6 pointer-events-none">
                <img src="/images/vantur.png" alt="Vantur Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-6xl font-black text-blue-900 tracking-tighter">VANTUR</h1>
              <p className="text-gray-500 max-w-md mx-auto text-lg">Desafio Bíblico Diário. Conclui os 3 modos todos os dias!</p>
              <div className="flex justify-center pt-2">
                <VanturHowToPlay variant="button" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl mt-8">
              <ModeCard 
                title="Solo" 
                description="Uma palavra. 6 tentativas. Recompensa: 1 XP, 1 Gold"
                mode="solo"
                icon={<Brain className={`w-12 h-12 ${finishedModes.includes('solo') ? 'text-gray-300' : 'text-blue-500'}`} />}
                userId={user.id}
                action={startVantur}
                isFinished={finishedModes.includes('solo')}
                finishedSession={finishedSessionFor('solo')}
              />
              <ModeCard 
                title="Mix" 
                description="Duas palavras. 7 tentativas. Recompensa: 2 XP, 2 Gold"
                mode="mix"
                icon={<Zap className={`w-12 h-12 ${finishedModes.includes('mix') ? 'text-gray-300' : 'text-amber-500'}`} />}
                userId={user.id}
                action={startVantur}
                isFinished={finishedModes.includes('mix')}
                finishedSession={finishedSessionFor('mix')}
              />
              <ModeCard 
                title="Plex" 
                description="Quatro palavras. 9 tentativas. Recompensa: 4 XP, 4 Gold"
                mode="plex"
                icon={<Layers className={`w-12 h-12 ${finishedModes.includes('plex') ? 'text-gray-300' : 'text-purple-500'}`} />}
                userId={user.id}
                action={startVantur}
                isFinished={finishedModes.includes('plex')}
                finishedSession={finishedSessionFor('plex')}
              />
            </div>
            
            {finishedModes.length > 0 && (
              <p className="text-sm font-bold text-blue-600 bg-blue-50 px-6 py-2 rounded-full shadow-sm">
                Já completaste {finishedModes.length} de 3 modos hoje!
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
