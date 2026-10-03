import type { CSSProperties } from 'react';
import { createClient } from '@/utils/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Gamepad2, Trophy, Lock, LogIn, Ban, Settings, Coins, Play, Zap, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { GAMES, fetchGameSettings, formatMultiplier, gameAvailabilitySummary, gameVisibilityFor, multiplierStatus } from '@/utils/games';
import { effectiveRole } from '@/utils/permissions';
import { displayFont } from '@/components/landing/fonts';
import { SiteFooter } from '@/components/landing/SiteFooter';

const D = displayFont.className;

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

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

  const settings = await fetchGameSettings(supabase);
  const role = effectiveRole(profile);
  const canManageGames = role === 'coordenador';

  const games = GAMES.flatMap((game) => {
    const setting = settings[game.id];
    const visibility = gameVisibilityFor(setting, role);
    // Escondido (surpresa): quem não pode jogar nem sabe que o jogo existe.
    if (visibility === 'hidden') return [];
    const bonus = multiplierStatus(setting);
    return [{
      ...game,
      available: visibility === 'available',
      // Campanha de pontos multiplicados a decorrer (só jogos de um jogador)
      bonus: bonus.state === 'active' ? bonus : null,
      // Mostrado a quem pode jogar quando o jogo não está aberto a todos (ex.: "Só liderança")
      restriction: setting.enabled ? gameAvailabilitySummary(setting) : null,
    }];
  });

  const availableCount = games.filter((g) => g.available).length;
  const level = Math.floor((profile?.total_xp || 0) / 1000) + 1;
  const xpInLevel = (profile?.total_xp || 0) % 1000;

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      <main className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 30% at 90% 5%, rgba(250,204,21,.2), transparent 70%), radial-gradient(45% 35% at 0% 20%, rgba(99,102,241,.3), transparent 70%), radial-gradient(40% 40% at 100% 80%, rgba(239,68,68,.15), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[640px] opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-14 sm:px-6 md:pt-20 lg:px-8">
          {/* ── Cabeçalho ─────────────────────────────────────── */}
          <header className="grid grid-cols-1 items-end gap-10 text-white lg:grid-cols-[1.3fr_0.7fr]">
            <div className="text-center lg:text-left">
              <div
                className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300 backdrop-blur"
                style={delay(0)}
              >
                <Gamepad2 className="h-3.5 w-3.5" /> Centro de Jogos
              </div>
              <h1
                className={`${D} lp-rise mt-5 text-5xl font-extrabold leading-[0.92] tracking-tight sm:text-7xl`}
                style={delay(100)}
              >
                Joga. Aprende.
                <br />
                <span className="lp-shimmer bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
                  Sobe de nível.
                </span>
              </h1>
              <p className="lp-rise mx-auto mt-5 max-w-xl text-lg text-blue-100/80 lg:mx-0" style={delay(200)}>
                Treina a tua mente e diverte-te enquanto ganhas XP e Gold!
              </p>
              <div className="lp-rise mt-6 flex flex-wrap justify-center gap-2.5 lg:justify-start" style={delay(300)}>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-semibold text-blue-100 ring-1 ring-inset ring-white/10">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  {availableCount} {availableCount === 1 ? 'jogo disponível' : 'jogos disponíveis'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-semibold text-blue-100 ring-1 ring-inset ring-white/10">
                  <Zap className="h-4 w-4 fill-yellow-300 text-yellow-300" /> Ganha XP e Gold a jogar
                </span>
              </div>
            </div>

            {user ? (
              <div className="lp-rise relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-indigo-500 to-violet-700 p-6 shadow-xl shadow-indigo-950/40" style={delay(250)}>
                <Trophy aria-hidden className="absolute -bottom-6 -right-6 h-32 w-32 text-white/10" />
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-100">O teu progresso</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div>
                    <p className={`${D} text-5xl font-extrabold leading-none`}>Nível {level}</p>
                    <p className="mt-1 text-sm font-semibold text-indigo-100">{profile?.total_xp ?? 0} XP total</p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-extrabold text-blue-950">
                    <Coins className="h-4 w-4" /> {profile?.current_gold ?? 0}
                  </span>
                </div>
                <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-400 shadow-[0_0_16px_rgba(253,224,71,.6)]"
                    style={{ width: `${Math.max(3, xpInLevel / 10)}%` }}
                  />
                </div>
                <p className="mt-2 text-right text-xs font-semibold text-indigo-100">
                  Faltam {1000 - xpInLevel} XP para o nível {level + 1}
                </p>
              </div>
            ) : (
              <Link
                href="/login"
                className="lp-rise group relative block overflow-hidden rounded-[1.75rem] bg-yellow-400 p-6 text-blue-950 shadow-[0_20px_50px_-15px_rgba(250,204,21,.6)] transition-transform hover:-translate-y-1 hover:-rotate-1"
                style={delay(250)}
              >
                <Sparkles aria-hidden className="absolute -right-5 -top-5 h-24 w-24 text-white/30" />
                <p className={`${D} text-2xl font-extrabold leading-tight`}>
                  Faz login para ganhar XP e Gold!
                </p>
                <p className="mt-1.5 text-sm text-blue-950/75">Sem conta também podes jogar os jogos abertos a todos.</p>
                <span className="mt-4 inline-flex items-center gap-2 font-extrabold">
                  <LogIn className="h-4 w-4" /> Entrar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            )}
          </header>

          {/* ── Jogos ─────────────────────────────────────────── */}
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {games.map((game, i) => {
              const isAvailable = game.available;
              const needsLogin = isAvailable && game.requiresAuth && !user;
              const destination = needsLogin ? game.loginHref : game.href;

              return (
                <article
                  key={game.id}
                  className={`lp-rise group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-white/[0.06] ring-1 ring-inset ring-white/10 transition-all duration-300 ${
                    isAvailable ? 'hover:-translate-y-1.5 hover:bg-white/[0.09] hover:ring-white/25 hover:shadow-2xl hover:shadow-black/30' : ''
                  }`}
                  style={delay(350 + (i % 3) * 90)}
                >
                  <div className={`relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br ${game.color} ${isAvailable ? '' : 'grayscale'}`}>
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.6) 1px, transparent 0)',
                        backgroundSize: '14px 14px',
                      }}
                    />
                    {/* Cópia gigante e esbatida do ícone no fundo */}
                    <img
                      aria-hidden
                      src={game.image}
                      alt=""
                      className="absolute -right-6 -top-6 h-40 w-40 rotate-12 rounded-3xl object-contain opacity-20 blur-[2px] transition-transform duration-700 group-hover:rotate-0 group-hover:scale-125"
                    />
                    <div className="relative z-10 rounded-[1.4rem] bg-white p-3 shadow-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <img src={game.image} alt={game.title} className="h-20 w-20 rounded-xl object-contain" />
                    </div>

                    <span
                      className={`absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${
                        !isAvailable
                          ? 'bg-black/50 text-white'
                          : needsLogin
                            ? 'bg-blue-950/60 text-yellow-300 backdrop-blur'
                            : 'bg-emerald-400 text-emerald-950'
                      }`}
                    >
                      {!isAvailable ? (
                        <><Ban className="h-3 w-3" /> Indisponível</>
                      ) : needsLogin ? (
                        <><Lock className="h-3 w-3" /> Com conta</>
                      ) : (
                        <><Zap className="h-3 w-3" /> Disponível</>
                      )}
                    </span>

                    {isAvailable && game.bonus && (
                      <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-amber-950 shadow-lg">
                        <Sparkles className="h-3 w-3" /> Pontos ×{formatMultiplier(game.bonus.multiplier)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h2 className={`${D} text-2xl font-extrabold text-white`}>{game.title}</h2>
                    <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-blue-100/70">{game.description}</p>

                    {isAvailable && game.bonus && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Sparkles className="h-3 w-3" />
                        Pontos a {game.bonus.multiplier === 2 ? 'dobrar' : `×${formatMultiplier(game.bonus.multiplier)}`}
                        {game.bonus.endsAt && ` até ${game.bonus.endsAt.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    )}

                    {isAvailable && game.restriction && game.restriction.tone !== 'green' && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <Lock className="h-3 w-3" /> {game.restriction.label}
                        {game.restriction.hidden && ' · escondido dos restantes'}
                      </p>
                    )}
                    {needsLogin && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <Lock className="h-3 w-3" /> Requer conta para jogar
                      </p>
                    )}
                    {!isAvailable && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-200/60">
                        <Ban className="h-3 w-3" /> De momento este jogo não está disponível.
                      </p>
                    )}

                    <div className="mt-auto pt-6">
                      {isAvailable ? (
                        <Link
                          href={destination}
                          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-lg font-extrabold transition-all active:scale-[0.98] ${
                            needsLogin
                              ? 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/20'
                              : 'bg-yellow-400 text-blue-950 shadow-[0_12px_30px_-12px_rgba(250,204,21,.7)] hover:bg-yellow-300'
                          }`}
                        >
                          {needsLogin ? (
                            <><LogIn className="h-4 w-4" /> Fazer Login</>
                          ) : (
                            <><Play className="h-5 w-5 fill-current" /> Jogar Agora</>
                          )}
                        </Link>
                      ) : (
                        <span className="flex w-full cursor-not-allowed items-center justify-center rounded-2xl bg-white/5 py-3.5 text-lg font-bold text-blue-200/40">
                          Indisponível
                        </span>
                      )}
                      {!isAvailable && canManageGames && (
                        <Link href="/admin?tab=games" className="mt-3 flex items-center justify-center gap-1 text-xs font-bold text-yellow-300 hover:underline">
                          <Settings className="h-3 w-3" /> Gerir disponibilidade
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Próximos jogos */}
            <article
              className="lp-rise relative flex flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border-2 border-dashed border-white/15 p-8 text-center"
              style={delay(350 + (games.length % 3) * 90)}
            >
              <div className={`${D} lp-float flex h-24 w-24 -rotate-6 items-center justify-center rounded-3xl bg-white/[0.07] text-5xl font-extrabold text-yellow-300 ring-1 ring-inset ring-white/15`}>
                ?
              </div>
              <h2 className={`${D} mt-6 text-2xl font-extrabold text-white`}>Em breve...</h2>
              <p className="mt-2 max-w-xs text-sm text-blue-100/60">
                Mais desafios estão a ser preparados pelos teus líderes!
              </p>
              <span className="mt-5 rounded-full bg-white/[0.07] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-200/60">
                Bloqueado
              </span>
            </article>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
