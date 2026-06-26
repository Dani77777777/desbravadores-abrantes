import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ChevronLeft, BookOpen, ScrollText, Plus, Trash2, Search, X, AlertCircle } from 'lucide-react';
import { normalizeText } from '@/utils/text-normalization';
import { isAdminRole } from '@/utils/permissions';

export default async function VanturAdminPage({ searchParams }: { searchParams: Promise<{ qBib?: string, qDict?: string, error?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const qBib = params.qBib?.toUpperCase() || '';
  const qDict = params.qDict?.toUpperCase() || '';
  const errorMsg = params.error || '';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const isAdmin = isAdminRole(profile);
  if (!isAdmin) redirect('/');

  // Fetch words with filtering
  let bibQuery = supabase.from('vantur_dictionary').select('*');
  if (qBib) bibQuery = bibQuery.ilike('word', `%${qBib}%`);
  const { data: bibWords } = await bibQuery.order('created_at', { ascending: false }).limit(20);

  let dictQuery = supabase.from('portuguese_words').select('*');
  if (qDict) {
    dictQuery = dictQuery.or(`word_clean.ilike.%${qDict}%,word_display.ilike.%${qDict}%`);
  }
  const { data: dictWords } = await dictQuery.order('word_clean', { ascending: true }).limit(20);

  async function addBiblicalWord(formData: FormData) {
    'use server'
    const word = (formData.get('word') as string).toUpperCase().trim();
    if (word.length !== 5) return;

    const supabaseAction = await (await import('@/utils/supabase/server')).createClient();
    const { error } = await supabaseAction.from('vantur_dictionary').insert({ word });
    
    if (error) {
      console.error('Error adding biblical word:', error);
      redirect(`/admin/vantur?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath('/admin/vantur');
  }

  async function addDictionaryWord(formData: FormData) {
    'use server'
    const display = (formData.get('display') as string).toUpperCase().trim();
    if (!display) return;
    
    const clean = normalizeText(display).toUpperCase();

    const supabaseAction = await (await import('@/utils/supabase/server')).createClient();
    const { error } = await supabaseAction.from('portuguese_words').upsert({ 
      word_clean: clean, 
      word_display: display 
    });
    
    if (error) {
       console.error('Error adding dict word:', error);
       redirect(`/admin/vantur?error=${encodeURIComponent(error.message)}`);
    }
    revalidatePath('/admin/vantur');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <Link href="/admin" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 font-medium transition-colors group">
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Voltar à Gestão
            </Link>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter">Gestão Vantur</h1>
            <p className="text-slate-500 max-w-lg">Alimenta o jogo com novas palavras bíblicas e expande o dicionário de validação.</p>
          </div>
          
          <div className="flex bg-white p-2 rounded-3xl shadow-sm border border-slate-100 items-center gap-2">
             <div className="px-6 py-3 bg-blue-50 text-blue-600 rounded-2xl font-bold text-sm">Controlo de Dicionário</div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-8 flex items-center gap-3 p-6 bg-red-50 text-red-600 rounded-3xl border border-red-100 animate-in fade-in slide-in-from-top-4 duration-500">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
               <p className="font-black uppercase text-sm">Erro ao adicionar:</p>
               <p className="font-medium">{errorMsg}</p>
            </div>
            <Link href="/admin/vantur" className="p-2 hover:bg-red-100 rounded-xl transition-all">
              <X className="w-5 h-5" />
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          
          {/* SECÇÃO 1: PALAVRAS BÍBLICAS (SEGREDO) */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                    <ScrollText className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Palavras Bíblicas</h2>
                    <p className="text-sm text-slate-400 font-medium tracking-tighter">Segredos do jogo (5 chars)</p>
                  </div>
                </div>
              </div>

              <form method="GET" className="relative">
                <input type="hidden" name="qDict" value={qDict} />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  name="qBib" 
                  defaultValue={qBib}
                  placeholder="Pesquisar..." 
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                />
              </form>

              <form action={addBiblicalWord} className="flex gap-3">
                <input 
                  type="text" 
                  name="word" 
                  placeholder="NOVA PALAVRA" 
                  maxLength={5} minLength={5} required
                  className="flex-1 px-6 py-4 bg-blue-50/30 border-2 border-blue-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-black text-lg text-blue-900 placeholder:text-blue-300"
                />
                <button type="submit" className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-xl">
                  <Plus className="w-5 h-5" /> Adicionar
                </button>
              </form>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
                  {qBib ? `Resultados` : 'Recentes'} ({bibWords?.length || 0})
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {bibWords?.map(w => (
                    <div key={w.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors group">
                      <span className="font-bold text-slate-700 text-lg tracking-widest">{w.word}</span>
                      <form action={async () => {
                        'use server';
                        const sb = await (await import('@/utils/supabase/server')).createClient();
                        await sb.from('vantur_dictionary').delete().eq('id', w.id);
                        revalidatePath('/admin/vantur');
                      }}>
                        <button type="submit" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECÇÃO 2: DICIONÁRIO DE VALIDAÇÃO */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800">Dicionário Geral</h2>
                  <p className="text-sm text-slate-400 font-medium tracking-tight tracking-tighter">Validação de palavras</p>
                </div>
              </div>

              <form method="GET" className="relative">
                <input type="hidden" name="qBib" value={qBib} />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  name="qDict" 
                  defaultValue={qDict}
                  placeholder="Pesquisar..." 
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-amber-500 focus:bg-white outline-none transition-all font-bold"
                />
              </form>

              <form action={addDictionaryWord} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    name="display" 
                    placeholder="NOVA PALAVRA (EX: UNIÃO)" 
                    required
                    className="flex-1 px-6 py-4 bg-amber-50/30 border-2 border-amber-100 rounded-2xl focus:border-amber-500 focus:bg-white outline-none transition-all font-black text-lg text-amber-900 placeholder:text-amber-300"
                  />
                  <button type="submit" className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20">
                    <Plus className="w-5 h-5" /> Adicionar
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
                   {qDict ? `Resultados` : 'Recentes'} ({dictWords?.length || 0})
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {dictWords?.map(w => (
                    <div key={w.word_clean} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors group">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 text-lg tracking-tight">{w.word_display}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Limpa: {w.word_clean}</span>
                      </div>
                      <form action={async () => {
                        'use server';
                        const sb = await (await import('@/utils/supabase/server')).createClient();
                        await sb.from('portuguese_words').delete().eq('word_clean', w.word_clean);
                        revalidatePath('/admin/vantur');
                      }}>
                        <button type="submit" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
