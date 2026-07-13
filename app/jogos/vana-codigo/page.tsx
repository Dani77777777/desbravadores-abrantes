import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ChevronLeft, Flag, Radio, KeyRound } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import VanaCodigoGame from '@/components/vana-codigo/VanaCodigoGame';
import VanaCodigoHowToPlay from '@/components/vana-codigo/VanaCodigoHowToPlay';
import { getCodeTypeForDate, CODE_LABELS } from '@/utils/vana-codigo/codecs';
import { getDailySecret, VanaCodigoMode } from '@/utils/vana-codigo/word-bank';

interface ModeCardProps {
  title: string;
  description: string;
  mode: string;
  icon: React.ReactNode;
  userId: string;
  action: (formData: FormData) => Promise<void>;
  isFinished?: boolean;
}

function ModeCard({ title, description, mode, icon, userId, action, isFinished }: ModeCardProps) {
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center text-center gap-6 transition-all hover:shadow-xl hover:-translate-y-1 ${isFinished ? 'opacity-75 grayscale-[0.5]' : ''}`}>
      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-2 ${isFinished ? 'bg-slate-50' : 'bg-emerald-50/50'}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-2xl font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
      </div>

      {isFinished ? (
        <div className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl font-bold cursor-not-allowed">
          CONCLUÍDO HOJE
        </div>
      ) : (
        <form action={action} className="w-full">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
          >
            DECIFRAR
          </button>
        </form>
      )}
    </div>
  );
}

export default async function VanaCodigoGamePage() {
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

  // Sessões de hoje deste utilizador
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: sessions } = await supabase
    .from('vana_codigo_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('updated_at', todayStart.toISOString());

  const finishedModes = (sessions || []).filter(s => s.is_finished).map(s => s.mode);
  const activeSessions = (sessions || []).filter(s => !s.is_finished);

  const todayCodeLabel = CODE_LABELS[getCodeTypeForDate(new Date())];

  async function startVanaCodigo(formData: FormData) {
    'use server'
    const modeVal = formData.get('mode') as VanaCodigoMode;
    const uId = formData.get('userId') as string;

    try {
      const supabaseAction = await (await import('@/utils/supabase/server')).createClient();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: existing } = await supabaseAction
        .from('vana_codigo_sessions')
        .select('is_finished')
        .eq('user_id', uId)
        .eq('mode', modeVal)
        .gte('created_at', today.toISOString())
        .single();

      if (existing?.is_finished) return;

      // Desafio do dia — igual para todos os jogadores
      const now = new Date();
      const secretText = getDailySecret(modeVal, now);
      const codeType = getCodeTypeForDate(now);

      await supabaseAction.from('vana_codigo_sessions').upsert({
        user_id: uId,
        mode: modeVal,
        code_type: codeType,
        secret_text: secretText,
        attempts: [],
        revealed_indices: [],
        is_finished: false,
        is_won: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, mode' });

      revalidatePath('/jogos/vana-codigo');
    } catch (error) {
      if ((error as any)?.digest?.includes('NEXT_REDIRECT')) throw error;
      console.error('Critical failure starting VanaCodigo:', error);
    }

    redirect('/jogos/vana-codigo');
  }

  const currentActiveSession = activeSessions.length > 0 ? activeSessions[0] : null;

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/jogos" className="inline-flex items-center gap-2 text-gray-500 hover:text-emerald-600 mb-8 font-medium transition-colors group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Voltar ao Hub de Jogos
        </Link>

        {currentActiveSession ? (
          <VanaCodigoGame initialSession={currentActiveSession} userId={user.id} />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
            <div className="text-center space-y-3">
              <div className="mx-auto w-32 h-32 mb-6 pointer-events-none">
                <img src="/images/VanaCodigo.png" alt="VanaCódigo Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-6xl font-black text-emerald-900 tracking-tighter">VANACÓDIGO</h1>
              <p className="text-gray-500 max-w-md mx-auto text-lg">
                Desafio diário de decifração. Morse, Semáforo e Cifras — treina as tuas especialidades!
              </p>
              <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 inline-block px-5 py-1.5 rounded-full">
                Código de hoje: {todayCodeLabel}
              </p>
              <div className="flex justify-center pt-2">
                <VanaCodigoHowToPlay variant="button" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl mt-8">
              <ModeCard
                title="Recruta"
                description="Palavra curta. 5 tentativas. Recompensa: 1 XP, 1 Gold"
                mode="recruta"
                icon={<Flag className={`w-12 h-12 ${finishedModes.includes('recruta') ? 'text-gray-300' : 'text-emerald-500'}`} />}
                userId={user.id}
                action={startVanaCodigo}
                isFinished={finishedModes.includes('recruta')}
              />
              <ModeCard
                title="Explorador"
                description="Palavra longa. 5 tentativas. Recompensa: 2 XP, 2 Gold"
                mode="explorador"
                icon={<Radio className={`w-12 h-12 ${finishedModes.includes('explorador') ? 'text-gray-300' : 'text-teal-500'}`} />}
                userId={user.id}
                action={startVanaCodigo}
                isFinished={finishedModes.includes('explorador')}
              />
              <ModeCard
                title="Mestre"
                description="Frase secreta. 6 tentativas. Recompensa: 4 XP, 4 Gold"
                mode="mestre"
                icon={<KeyRound className={`w-12 h-12 ${finishedModes.includes('mestre') ? 'text-gray-300' : 'text-indigo-500'}`} />}
                userId={user.id}
                action={startVanaCodigo}
                isFinished={finishedModes.includes('mestre')}
              />
            </div>

            {finishedModes.length > 0 && (
              <p className="text-sm font-bold text-emerald-600 bg-emerald-50 px-6 py-2 rounded-full shadow-sm">
                Já completaste {finishedModes.length} de 3 modos hoje!
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
