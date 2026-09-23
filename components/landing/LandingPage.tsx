"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import {
  Trophy,
  Users,
  ArrowRight,
  ArrowDown,
  Shield,
  Heart,
  Gamepad2,
  Coins,
  Tent,
  Compass,
  Sparkles,
  MapPin,
  Zap,
  Lock,
  Star,
} from "lucide-react";
import { GAMES, type GameVisibility } from "@/utils/games";
import { displayFont } from "./fonts";
import { SiteFooter } from "./SiteFooter";
import { NextEventCard, type PublicEvent } from "./NextEventCard";

const PHOTO = "/images/desbravadores todos 2.jpg";
const D = displayFont.className;

const MARQUEE_WORDS = [
  "Aventura",
  "Amizade",
  "Fé",
  "Natureza",
  "Especialidades",
  "Acampamentos",
  "Serviço",
  "Caráter",
];

/** Atraso de animação (entrada / reveal) em ms. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/**
 * gameVisibility: id do jogo → estado para visitantes sem conta (jogos escondidos não aparecem).
 * nextEvent: próximo evento aberto a todo o clube (null = não há, a secção não aparece).
 */
export function LandingPage({
  gameVisibility = {},
  nextEvent = null,
}: {
  gameVisibility?: Record<string, GameVisibility>;
  nextEvent?: PublicEvent | null;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If there's a hash with auth tokens (user landed on root from an email link),
    // redirect to /login which handles all auth hash processing
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      if (hash.includes("type=recovery")) {
        router.replace("/login/reset-password" + hash);
      } else {
        // signup, magiclink, etc.
        router.replace("/login" + hash);
      }
    }
  }, [router]);

  // Secções com data-reveal aparecem com animação quando entram no ecrã.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) return;
    root.classList.add("lp-js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const visibleGames = GAMES.filter(
    (game) => gameVisibility[game.id] !== "hidden",
  );

  return (
    <div
      ref={rootRef}
      className="min-h-screen overflow-x-clip bg-blue-950 font-sans text-stone-900"
    >
      <Navbar user={null} profile={null} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-950 text-white">
        {/* Luzes e grelha de fundo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 85% 20%, rgba(250,204,21,.22), transparent 70%), radial-gradient(50% 60% at 0% 100%, rgba(59,130,246,.35), transparent 70%), radial-gradient(40% 40% at 50% 0%, rgba(239,68,68,.18), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:px-8 lg:pb-28">
          <div className="text-center lg:text-left">
            <div
              className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-yellow-300 backdrop-blur sm:text-xs sm:tracking-[0.18em]"
              style={delay(0)}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" /> Desbravadores · Abrantes
            </div>

            <h1
              className={`${D} lp-rise mt-6 text-[2.9rem] font-extrabold leading-[0.95] tracking-tight sm:text-7xl xl:text-8xl`}
              style={delay(120)}
            >
              Uma aventura que{" "}
              <span className="relative inline-block">
                <span className="lp-shimmer bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
                  transforma
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 300 20"
                  preserveAspectRatio="none"
                  className="absolute -bottom-2 left-0 h-3 w-full text-yellow-400 sm:h-4"
                >
                  <path
                    d="M3 14 C 60 3, 120 3, 170 10 S 260 17, 297 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              vidas.
            </h1>

            <p
              className="lp-rise mx-auto mt-7 max-w-xl text-lg leading-relaxed text-blue-100/85 sm:text-xl lg:mx-0"
              style={delay(240)}
            >
              Explora a natureza, faz amigos para a vida e descobre do que és
              capaz. Aqui, cada passo é uma nova descoberta.
            </p>

            <div
              className="lp-rise mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start"
              style={delay(360)}
            >
              <Link
                href="/login?mode=signup"
                className="group relative inline-flex items-center gap-2 rounded-full bg-yellow-400 px-8 py-4 text-lg font-extrabold text-blue-950 shadow-[0_0_0_4px_rgba(250,204,21,.18),0_18px_40px_-10px_rgba(250,204,21,.6)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 active:translate-y-0"
              >
                Começa a tua jornada
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                onClick={() =>
                  document
                    .getElementById("welcome")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-6 py-4 font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/10"
              >
                Conhece o clube <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            <div
              className="lp-rise mt-10 flex flex-wrap justify-center gap-2.5 lg:justify-start"
              style={delay(480)}
            >
              {[
                { icon: Tent, label: "Acampamentos" },
                { icon: Compass, label: "Especialidades" },
                { icon: Gamepad2, label: "Jogos & XP" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-sm font-medium text-blue-100 ring-1 ring-inset ring-white/10"
                >
                  <Icon className="h-4 w-4 text-yellow-300" /> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Foto em "cartão" com autocolantes */}
          <div
            className="lp-rise relative mx-auto w-full max-w-md lg:max-w-none"
            style={delay(200)}
          >
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[3rem] bg-gradient-to-tr from-yellow-400/40 via-orange-500/20 to-blue-500/40 blur-3xl"
            />
            <div className="relative rotate-2 rounded-[2rem] bg-white p-2.5 shadow-2xl shadow-black/40 transition-transform duration-500 hover:rotate-0 sm:p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] lg:aspect-square">
                <Image
                  src={PHOTO}
                  alt="Membros do Clube de Desbravadores de Abrantes de farda"
                  fill
                  priority
                  sizes="(min-width: 1024px) 560px, 90vw"
                  className="object-cover object-[50%_40%] transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-blue-950/70 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  A família DBV Abrantes
                </div>
              </div>
            </div>

            {/* Autocolante: especialidades */}
            <div
              className="lp-float absolute -left-2 -top-7 sm:-left-8 sm:top-8"
              style={delay(0)}
            >
              <div className="-rotate-6 rounded-2xl bg-yellow-400 px-3 py-2 text-blue-950 shadow-xl ring-4 ring-blue-950 sm:px-4 sm:py-3">
                <div className={`${D} text-2xl font-extrabold leading-none sm:text-3xl`}>
                  100+
                </div>
                <div className="text-xs font-bold uppercase tracking-wide">
                  especialidades
                </div>
              </div>
            </div>

            {/* Autocolante: XP */}
            <div
              className="lp-float absolute -right-2 bottom-6 sm:-right-6"
              style={delay(1200)}
            >
              <div className="rotate-6 flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-xl ring-4 ring-blue-950">
                <Zap className="h-5 w-5 fill-yellow-300 text-yellow-300" />
                +XP
              </div>
            </div>

            {/* Selo circular a rodar */}
            <div className="absolute -right-3 -top-10 h-24 w-24 sm:-right-10 sm:-top-12 sm:h-32 sm:w-32">
              <div className="relative h-full w-full rounded-full bg-red-500 shadow-xl ring-4 ring-blue-950">
                <svg viewBox="0 0 120 120" className="lp-spin h-full w-full">
                  <defs>
                    <path
                      id="lp-circle"
                      d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"
                    />
                  </defs>
                  <text
                    className="fill-white text-[11px] font-extrabold uppercase"
                    textLength="272"
                    lengthAdjust="spacing"
                  >
                    <textPath href="#lp-circle">
                      Aventura • Amizade • Fé •
                    </textPath>
                  </text>
                </svg>
                <Star className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 fill-yellow-300 text-yellow-300" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Faixas a correr ────────────────────────────────── */}
        {/* Dentro do topo para herdarem o mesmo fundo com gradiente. A parte de baixo
            (por trás da faixa vermelha) já tem a cor da secção seguinte, para não
            aparecer uma lista de azul liso por baixo das faixas inclinadas. */}
        <div
          aria-hidden
          className="relative z-20 bg-[linear-gradient(to_bottom,transparent_58%,#fafaf9_58%)] py-6"
        >
          <Marquee
            className="-rotate-2 bg-yellow-400 text-blue-950"
            starClass="text-red-500"
          />
          <Marquee
            reverse
            className="-mt-3 rotate-1 bg-red-500 text-white"
            starClass="text-yellow-300"
          />
        </div>
      </section>

      {/* ── Próximo evento (aberto a todo o clube) ───────────── */}
      {nextEvent && (
        <section className="relative bg-stone-50 pt-20">
          <div data-reveal className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <NextEventCard event={nextEvent} />
          </div>
        </section>
      )}

      {/* ── O que são os Desbravadores ───────────────────────── */}
      <section id="welcome" className="relative scroll-mt-16 bg-stone-50 pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
            <div data-reveal>
              <Kicker className="text-blue-700">O que são os Desbravadores?</Kicker>
              <h2
                className={`${D} mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-blue-950 sm:text-5xl`}
              >
                Um movimento mundial de jovens{" "}
                <span className="box-decoration-clone bg-[linear-gradient(transparent_62%,#fde047_62%,#fde047_92%,transparent_92%)] px-1">
                  à&nbsp;procura de propósito.
                </span>
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-stone-600">
                Rapazes e raparigas de todas as idades, origens, cores e
                religiões. Juntamo-nos todas as semanas para aprender coisas
                novas, ajudar a comunidade e fortalecer o nosso caráter.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-950 px-4 py-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-yellow-300" /> Encontros
                  semanais
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-950 ring-1 ring-stone-200">
                  <Users className="h-4 w-4 text-blue-600" /> Todos são
                  bem-vindos
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FeatureTile
                reveal={0}
                wrapperClass="col-span-2 sm:col-span-1"
                className="bg-gradient-to-br from-yellow-300 to-orange-400 text-blue-950"
                icon={<Compass className="h-6 w-6" />}
                iconClass="bg-blue-950 text-yellow-300"
                title={
                  <>
                    <span className={`${D} block text-5xl font-extrabold leading-none`}>
                      100+
                    </span>
                    Especialidades para aprender
                  </>
                }
                text="De Primeiros Socorros a Astronomia."
                textClass="text-blue-950/75"
              />
              <FeatureTile
                reveal={120}
                wrapperClass="col-span-2 sm:col-span-1 sm:translate-y-8"
                className="bg-emerald-500 text-white"
                icon={<Shield className="h-6 w-6" />}
                iconClass="bg-white/20 text-white"
                title="Valores fortes"
                text="Honra, amizade e serviço ao próximo."
                textClass="text-emerald-50"
              />
              <FeatureTile
                reveal={240}
                wrapperClass="col-span-2 sm:mt-4"
                className="bg-blue-600 text-white"
                icon={<Users className="h-6 w-6" />}
                iconClass="bg-white/20 text-white"
                title="Comunidade"
                text="Um lugar onde todos pertencem. Aqui ninguém fica de fora."
                textClass="text-blue-100"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── O nosso clube (Abrantes) ─────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-950 py-24 text-white md:py-32">
        <Image
          src={PHOTO}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover object-[50%_40%] opacity-20 mix-blend-luminosity"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-blue-950 via-blue-950/90 to-blue-950/40"
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="max-w-3xl">
            <span className="inline-flex rotate-[-2deg] items-center rounded-lg bg-yellow-400 px-3 py-1 text-sm font-extrabold uppercase tracking-wider text-blue-950">
              O nosso clube
            </span>
            <h2
              className={`${D} mt-6 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl md:text-7xl`}
            >
              Desbravadores
              <br />
              <span className="text-yellow-400">de Abrantes.</span>
            </h2>
          </div>

          <figure data-reveal style={delay(120)} className="relative mt-12 max-w-3xl">
            <span
              aria-hidden
              className={`${D} block h-12 text-8xl font-extrabold leading-none text-red-500`}
            >
              “
            </span>
            <blockquote
              className={`${D} relative text-2xl font-semibold leading-snug text-white sm:text-3xl`}
            >
              Aqui em Abrantes não somos só um clube. Somos uma família que
              cresce junta, no coração de Portugal.
            </blockquote>
          </figure>

          <div className="mt-14 grid max-w-5xl grid-cols-1 gap-8 text-lg leading-relaxed text-blue-100/85 md:grid-cols-2">
            <p data-reveal style={delay(200)}>
              O clube nasceu da vontade de dar aos jovens da região um espaço
              seguro e cheio de estímulo para crescerem no corpo, na mente e no
              espírito.
            </p>
            <p data-reveal style={delay(300)}>
              As reuniões são cheias de energia: treinamos para acampamentos,
              descobrimos a natureza do Ribatejo e preparamo-nos para ser
              cidadãos exemplares e servos de Deus.
            </p>
          </div>

          <div data-reveal style={delay(380)} className="mt-12 flex flex-wrap gap-3">
            {["Físico", "Mental", "Espiritual"].map((pillar, i) => (
              <span
                key={pillar}
                className={`rounded-full px-5 py-2 text-sm font-bold uppercase tracking-wider ring-1 ring-inset ${
                  ["bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", "bg-sky-500/15 text-sky-300 ring-sky-400/30", "bg-yellow-500/15 text-yellow-300 ring-yellow-400/30"][i]
                }`}
              >
                {pillar}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Porquê este site (gamificação) ───────────────────── */}
      <section className="relative bg-stone-50 py-24 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div data-reveal className="mx-auto max-w-3xl text-center">
            <Kicker className="text-indigo-600">Porquê este site?</Kicker>
            <h2
              className={`${D} mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-blue-950 sm:text-5xl`}
            >
              A tua jornada no clube,{" "}
              <span className="text-indigo-600">em modo jogo.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-stone-600">
              Queremos que a tua progressão no clube seja tão emocionante como
              um jogo. Criámos esta plataforma para tornar os teus feitos
              visíveis e recompensar o teu esforço.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-6">
            {/* XP */}
            <div
              data-reveal
              className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 to-violet-700 p-7 text-white shadow-xl shadow-indigo-900/20 md:col-span-4 md:p-9"
            >
              <div
                aria-hidden
                className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
              />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                    <Trophy className="h-7 w-7 text-yellow-300" />
                  </div>
                  <h3 className={`${D} mt-5 text-3xl font-extrabold sm:text-4xl`}>
                    Ganha XP
                  </h3>
                  <p className="mt-2 max-w-md text-indigo-100">
                    Completa tarefas, participa em eventos e sobe de nível à
                    medida que aprendes novas competências.
                  </p>
                </div>
                <span className="hidden shrink-0 rotate-3 rounded-xl bg-yellow-300 px-3 py-1.5 text-sm font-extrabold text-indigo-900 sm:inline-block">
                  LEVEL UP!
                </span>
              </div>
              <div className="relative mt-8">
                <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-wider text-indigo-100">
                  <span>O teu nível</span>
                  <span>Próximo nível</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-white/15 ring-1 ring-inset ring-white/10">
                  <div
                    className="lp-xp-fill h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-400 shadow-[0_0_20px_rgba(253,224,71,.6)]"
                    style={{ "--w": "72%" } as CSSProperties}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Tarefas", "Eventos", "Competências"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/15"
                    >
                      + {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Gold */}
            <div
              data-reveal
              style={delay(120)}
              className="relative overflow-hidden rounded-[2rem] bg-yellow-400 p-7 text-blue-950 shadow-xl shadow-yellow-700/20 md:col-span-2 md:p-9"
            >
              <GoldClicker />
              <h3 className={`${D} mt-5 text-3xl font-extrabold`}>
                Acumula Gold
              </h3>
              <p className="mt-2 text-blue-950/75">
                A tua dedicação é recompensada com moedas que podes usar em
                bónus exclusivos do clube.
              </p>
            </div>

            {/* Serviço e fé */}
            <div
              data-reveal
              style={delay(200)}
              className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-rose-500 to-red-600 p-7 text-white shadow-xl shadow-red-900/20 md:col-span-6 md:flex md:items-center md:gap-8 md:p-9"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <Heart className="h-8 w-8 fill-white/90" />
              </div>
              <div className="mt-5 md:mt-0">
                <h3 className={`${D} text-3xl font-extrabold`}>Serviço e Fé</h3>
                <p className="mt-2 max-w-2xl text-rose-50">
                  O sistema também destaca a tua participação em projetos
                  sociais e o teu crescimento espiritual.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Centro de jogos ──────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-950 py-24 text-white md:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40% 50% at 10% 10%, rgba(99,102,241,.35), transparent 70%), radial-gradient(40% 50% at 90% 90%, rgba(250,204,21,.18), transparent 70%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            data-reveal
            className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end"
          >
            <div>
              <Kicker className="text-yellow-300">
                <Gamepad2 className="h-4 w-4" /> Centro de Jogos
              </Kicker>
              <h2
                className={`${D} mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl`}
              >
                Joga. Aprende.
                <br />
                <span className="text-yellow-400">Sobe de nível.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-blue-100/80">
                Joga, aprende e acumula XP enquanto te divertes com os teus
                amigos.
              </p>
            </div>
            <Link
              href="/jogos"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3.5 font-bold text-blue-950 transition-all hover:-translate-y-0.5 hover:bg-yellow-400"
            >
              Ver todos os jogos
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleGames.map((game, i) => {
              const available =
                (gameVisibility[game.id] ?? "available") === "available";
              const href = game.requiresAuth ? game.loginHref : game.href;

              const card = (
                <div
                  className={`group relative h-full overflow-hidden rounded-3xl bg-white/[0.06] ring-1 ring-inset ring-white/10 transition-all duration-300 ${
                    available
                      ? "hover:-translate-y-1.5 hover:bg-white/10 hover:ring-white/25"
                      : "opacity-70"
                  }`}
                >
                  <div
                    className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${game.color} ${available ? "" : "grayscale"}`}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 1px 1px, rgba(255,255,255,.6) 1px, transparent 0)",
                        backgroundSize: "14px 14px",
                      }}
                    />
                    <div className="relative z-10 rounded-3xl bg-white p-3 shadow-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <img
                        src={game.image}
                        alt={game.title}
                        className="h-16 w-16 rounded-xl object-contain"
                      />
                    </div>
                    <span
                      className={`absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                        !available
                          ? "bg-black/50 text-white"
                          : game.requiresAuth
                            ? "bg-blue-950/60 text-yellow-300 backdrop-blur"
                            : "bg-emerald-400 text-emerald-950"
                      }`}
                    >
                      {!available ? (
                        "Indisponível"
                      ) : game.requiresAuth ? (
                        <>
                          <Lock className="h-3 w-3" /> Com conta
                        </>
                      ) : (
                        <>
                          <Zap className="h-3 w-3" /> Joga já
                        </>
                      )}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className={`${D} text-xl font-extrabold text-white`}>
                      {game.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-blue-100/70">
                      {game.description}
                    </p>
                    {!available && (
                      <p className="mt-3 text-xs font-semibold text-blue-200/60">
                        De momento não está disponível
                      </p>
                    )}
                  </div>
                </div>
              );

              return (
                <div key={game.id} data-reveal style={delay((i % 3) * 100)}>
                  {available ? (
                    <Link href={href} className="block h-full">
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-yellow-400 py-24 text-blue-950 md:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #172554 1.5px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <Star
          aria-hidden
          className="lp-spin absolute -left-10 top-10 h-40 w-40 fill-orange-400/60 text-orange-400/60"
        />
        <Star
          aria-hidden
          className="lp-spin absolute -bottom-12 -right-8 h-52 w-52 fill-red-500/40 text-red-500/40"
        />
        <div
          data-reveal
          className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8"
        >
          <h2
            className={`${D} text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl md:text-7xl`}
          >
            Pronto para a tua próxima aventura?
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg font-medium text-blue-950/75">
            Junta-te a nós e faz parte da história do Clube de Desbravadores de
            Abrantes.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-2 rounded-full bg-blue-950 px-10 py-5 text-xl font-extrabold text-white shadow-[0_18px_40px_-12px_rgba(23,37,84,.7)] transition-all hover:-translate-y-1 hover:bg-blue-900"
            >
              Criar conta agora
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <span className="font-medium text-blue-950/70">
              ou{" "}
              <Link
                href="/login?mode=login"
                className="font-extrabold text-blue-950 underline decoration-2 underline-offset-4 hover:text-red-600"
              >
                fazer login
              </Link>
            </span>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Kicker({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.2em] ${className}`}
    >
      <span className="h-0.5 w-6 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Marquee({
  className,
  starClass,
  reverse = false,
}: {
  className: string;
  starClass: string;
  reverse?: boolean;
}) {
  const row = MARQUEE_WORDS.map((word) => (
    <span key={word} className="flex items-center gap-6 px-3">
      <span>{word}</span>
      <Star className={`h-5 w-5 fill-current ${starClass}`} />
    </span>
  ));
  // A faixa é bem mais larga que o ecrã (130vw) para as pontas inclinadas nunca se
  // verem. A frase repete-se 4× e a animação anda 50% (2 repetições): assim a outra
  // metade cobre sempre a faixa toda e as palavras não "desaparecem" em ecrãs largos.
  return (
    <div className={`-ml-[15vw] w-[130vw] overflow-hidden py-3 shadow-lg ${className}`}>
      <div
        className={`lp-marquee flex w-max ${D} text-2xl font-extrabold uppercase tracking-tight sm:text-3xl`}
        style={
          {
            animationDirection: reverse ? "reverse" : "normal",
            "--lp-speed": reverse ? "76s" : "60s",
          } as CSSProperties
        }
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex">{row}</div>
        ))}
      </div>
    </div>
  );
}

function FeatureTile({
  wrapperClass,
  className,
  icon,
  iconClass,
  title,
  text,
  textClass,
  reveal,
}: {
  wrapperClass: string;
  className: string;
  icon: React.ReactNode;
  iconClass: string;
  title: React.ReactNode;
  text: string;
  textClass: string;
  reveal: number;
}) {
  return (
    <div data-reveal style={delay(reveal)} className={wrapperClass}>
      <div
        className={`group h-full rounded-[1.75rem] p-6 shadow-lg transition-transform duration-300 hover:-rotate-1 hover:scale-[1.02] ${className}`}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </div>
        <h3 className="mt-5 text-xl font-extrabold leading-tight">{title}</h3>
        <p className={`mt-1.5 text-sm leading-relaxed ${textClass}`}>{text}</p>
      </div>
    </div>
  );
}

/** Moeda que dá para "farmar": toca e ganha Gold (só por diversão). */
function GoldClicker() {
  const [gold, setGold] = useState(0);
  const [pops, setPops] = useState<number[]>([]);

  const tap = () => {
    setGold((g) => g + 1);
    const id = Date.now() + Math.random();
    setPops((p) => [...p, id]);
    setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 750);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={tap}
        aria-label="Tocar na moeda para ganhar Gold"
        className="lp-wiggle relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-500 shadow-[inset_0_-4px_0_rgba(146,64,14,.35),0_8px_20px_-6px_rgba(146,64,14,.6)] ring-4 ring-amber-600/40 transition-transform active:scale-90"
      >
        <Coins className="h-8 w-8 text-amber-800" />
        {pops.map((id) => (
          <span
            key={id}
            className="lp-pop pointer-events-none absolute left-1/2 top-0 text-lg font-extrabold text-blue-950"
          >
            +1
          </span>
        ))}
      </button>
      <div className="text-right">
        <div className={`${D} text-3xl font-extrabold tabular-nums leading-none`}>
          {gold}
        </div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-950/60">
          {gold === 0 ? "toca na moeda" : "Gold"}
        </div>
      </div>
    </div>
  );
}
