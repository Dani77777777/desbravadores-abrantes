import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ChevronLeft, BookOpen, ScrollText, Search, X, Info } from 'lucide-react';
import { normalizeText } from '@/utils/text-normalization';
import { isAdminRole } from '@/utils/permissions';
import { WORD_LIST } from '@/utils/vantur-word-list';
import { GameAvailabilityBanner } from '../components/GameAvailabilityBanner';
import { getDailyPlayersStats } from '@/lib/actions/daily-game-stats';
import { DailyPlayersCard } from '@/components/admin/DailyPlayersCard';
import { AddWordsForm } from './AddWordsForm';
import { DeleteWordButton } from './DeleteWordButton';

// Quantas palavras do dicionário geral mostrar de cada vez (pode ser grande)
const GENERAL_LIMIT = 60;
const LEXICON_SIZE = Object.keys(WORD_LIST).length;

// Só letras na pesquisa — vírgulas e parênteses partiam o filtro .or() do PostgREST
function cleanSearch(q?: string): string {
  return (q ?? '').normalize('NFC').replace(/[^\p{L}]/gu, '').toUpperCase();
}

// O sorteio (get_random_vantur_words) só tira palavras com exatamente 5 caracteres
function isDrawable(word: string): boolean {
  return word.normalize('NFC') === word && word.length === 5;
}

// Os palpites são validados pela lista fixa do código + as palavras secretas do dia
function inLexicon(word: string): boolean {
  return WORD_LIST[normalizeText(word)] !== undefined;
}

export default async function VanturAdminPage({ searchParams }: { searchParams: Promise<{ qBib?: string, qDict?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const qBib = cleanSearch(params.qBib);
  const qDict = cleanSearch(params.qDict);

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

  const dailyStats = await getDailyPlayersStats('vantur_sessions');

  // Palavras bíblicas: são poucas centenas, mostram-se todas
  let bibQuery = supabase.from('vantur_dictionary').select('id, word', { count: 'exact' });
  if (qBib) bibQuery = bibQuery.ilike('word', `%${qBib}%`);
  const { data: bibWords, count: bibCount } = await bibQuery.order('word').limit(1000);

  let dictQuery = supabase.from('portuguese_words').select('*', { count: 'exact' });
  if (qDict) {
    dictQuery = dictQuery.or(`word_clean.ilike.%${normalizeText(qDict).toUpperCase()}%,word_display.ilike.%${qDict}%`);
  }
  const { data: dictWords, count: dictCount } = await dictQuery.order('word_clean', { ascending: true }).limit(GENERAL_LIMIT);

  const bib = bibWords ?? [];
  const notDrawable = bib.filter((w) => !isDrawable(w.word));
  const outOfLexicon = bib.filter((w) => isDrawable(w.word) && !inLexicon(w.word));

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <Link href="/admin?tab=games" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 font-medium transition-colors group">
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Voltar aos Jogos
            </Link>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter">Gestão Vantur</h1>
            <p className="text-slate-500 max-w-lg">Alimenta o jogo com novas palavras bíblicas. Estas palavras também são usadas no VanaSketch.</p>
          </div>

          <div className="flex bg-white p-2 rounded-3xl shadow-sm border border-slate-100 items-center gap-2">
             <div className="px-6 py-3 bg-blue-50 text-blue-600 rounded-2xl font-bold text-sm">Controlo de Dicionário</div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <GameAvailabilityBanner gameId="vantur" />
          <DailyPlayersCard date={dailyStats.date} players={dailyStats.players} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

          {/* SECÇÃO 1: PALAVRAS BÍBLICAS (SEGREDO) */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                    <ScrollText className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Palavras Bíblicas</h2>
                    <p className="text-sm text-slate-400 font-medium tracking-tighter">As palavras secretas do jogo (5 letras)</p>
                  </div>
                </div>
                <span className="rounded-2xl bg-blue-50 px-4 py-2 text-2xl font-black tabular-nums text-blue-600" title="Total de palavras bíblicas">
                  {qBib ? bib.length : bibCount ?? 0}
                </span>
              </div>

              <AddWordsForm target="biblical" accent="blue" placeholder="NOVA PALAVRA (EX: SALMO)" />

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
                {qBib && (
                  <Link href={qDict ? `/admin/vantur?qDict=${qDict}` : '/admin/vantur'} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" title="Limpar pesquisa">
                    <X className="w-5 h-5" />
                  </Link>
                )}
              </form>

              {(notDrawable.length > 0 || outOfLexicon.length > 0) && (
                <div className="space-y-1.5 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs font-medium text-amber-800">
                  {notDrawable.length > 0 && (
                    <p>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />
                      <strong>{notDrawable.length}</strong> nunca sai{notDrawable.length !== 1 ? 'em' : ''} no sorteio porque não tem 5 letras — apaga e volta a escrever.
                    </p>
                  )}
                  {outOfLexicon.length > 0 && (
                    <p>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />
                      <strong>{outOfLexicon.length}</strong> não {outOfLexicon.length !== 1 ? 'estão' : 'está'} na lista de palavras do jogo: só {outOfLexicon.length !== 1 ? 'são aceites' : 'é aceite'} como palpite no dia em que {outOfLexicon.length !== 1 ? 'são' : 'é'} a palavra secreta.
                    </p>
                  )}
                </div>
              )}

              {bib.length === 0 ? (
                <p className="py-6 text-center text-sm font-medium text-slate-400">
                  {qBib ? 'Nenhuma palavra encontrada.' : 'Ainda não há palavras bíblicas.'}
                </p>
              ) : (
                <div className="flex max-h-[28rem] flex-wrap gap-2 overflow-y-auto pr-1">
                  {bib.map((w) => {
                    const drawable = isDrawable(w.word);
                    const known = inLexicon(w.word);
                    return (
                      <div
                        key={w.id}
                        className={`flex items-center gap-1.5 rounded-xl border py-1.5 pl-3 pr-1 ${
                          !drawable ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
                        }`}
                        title={!drawable ? 'Não tem 5 letras: nunca sai no sorteio' : !known ? 'Fora da lista de palavras do jogo' : undefined}
                      >
                        {(!drawable || !known) && (
                          <span className={`h-2 w-2 rounded-full ${!drawable ? 'bg-red-500' : 'bg-amber-500'}`} />
                        )}
                        <span className="font-bold tracking-widest text-slate-700">{w.word}</span>
                        <DeleteWordButton target="biblical" wordKey={w.id} label={w.word} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SECÇÃO 2: DICIONÁRIO GERAL (RESERVA DO SORTEIO) */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                    <BookOpen className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Dicionário Geral</h2>
                    <p className="text-sm text-slate-400 font-medium tracking-tighter">Reserva para o sorteio</p>
                  </div>
                </div>
                <span className="rounded-2xl bg-amber-50 px-4 py-2 text-2xl font-black tabular-nums text-amber-600" title="Total de palavras no dicionário geral">
                  {dictCount ?? 0}
                </span>
              </div>

              <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-medium text-slate-500">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  Só é usado quando não há palavras bíblicas suficientes para o modo escolhido (o Plex pede 4).
                  Os palpites dos jogadores <strong>não</strong> são validados por esta tabela, mas pela lista
                  de {LEXICON_SIZE.toLocaleString('pt-PT')} palavras que vem com o jogo, mais as palavras secretas do dia.
                </p>
              </div>

              <AddWordsForm target="general" accent="amber" placeholder="NOVA PALAVRA (EX: UNIÃO)" />

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
                {qDict && (
                  <Link href={qBib ? `/admin/vantur?qBib=${qBib}` : '/admin/vantur'} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" title="Limpar pesquisa">
                    <X className="w-5 h-5" />
                  </Link>
                )}
              </form>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
                  {qDict ? 'Resultados' : 'Por ordem alfabética'}
                  {(dictCount ?? 0) > GENERAL_LIMIT && ` (primeiras ${GENERAL_LIMIT} de ${dictCount} — usa a pesquisa)`}
                </p>
                {(dictWords ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm font-medium text-slate-400">
                    {qDict ? 'Nenhuma palavra encontrada.' : 'O dicionário geral está vazio.'}
                  </p>
                ) : (
                  <div className="flex max-h-[28rem] flex-wrap gap-2 overflow-y-auto pr-1">
                    {dictWords?.map((w) => (
                      <div
                        key={w.word_clean}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 py-1.5 pl-3 pr-1"
                        title={w.word_display !== w.word_clean ? `Sem acentos: ${w.word_clean}` : undefined}
                      >
                        <span className="font-bold tracking-wide text-slate-700">{w.word_display}</span>
                        <DeleteWordButton target="general" wordKey={w.word_clean} label={w.word_display} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
