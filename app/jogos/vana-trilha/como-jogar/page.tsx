import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, Play } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import TrailDemo from '@/components/vana-trilha/TrailDemo'
import {
  FAQ,
  HowToPlaySteps,
  RewardsNotes,
  RewardsTable,
  SpecialTilesList,
} from '@/components/vana-trilha/how-to-play-content'
import { STATION_THEME } from '@/utils/vana-trilha-labels'
import { VANATRILHA_STATIONS } from '@/types/vana-trilha'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes('localhost')
  ? process.env.NEXT_PUBLIC_SITE_URL
  : 'https://desbravadores-abrantes.vercel.app'
).replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Como jogar o VanaTrilha — Desbravadores de Abrantes',
  description:
    'Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida. Uma etapa nova todos os dias.',
  alternates: { canonical: '/jogos/vana-trilha/como-jogar' },
  openGraph: {
    title: 'VanaTrilha — A Rota da Promessa',
    description: 'O novo desafio bíblico diário do clube. Vê aqui como se joga.',
    url: '/jogos/vana-trilha/como-jogar',
    siteName: 'Desbravadores de Abrantes',
    locale: 'pt_PT',
    images: [
      {
        url: '/images/vanatrilha-anuncio.png',
        width: 1080,
        height: 1350,
        alt: 'VanaTrilha — A Rota da Promessa. Um desafio bíblico novo todos os dias.',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VanaTrilha — A Rota da Promessa',
    description: 'O novo desafio bíblico diário do clube. Vê aqui como se joga.',
    images: ['/images/vanatrilha-anuncio.png'],
  },
}

function SectionTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-4">
      {kicker && <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">{kicker}</p>}
      <h2 className="text-2xl font-black tracking-tight text-[#1E3A5F] sm:text-3xl">{children}</h2>
    </div>
  )
}

export default async function VanaTrilhaHowToPlayPage() {
  // Página pública: funciona sem login (ver utils/supabase/middleware.ts).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    profile = data
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/40 to-stone-50">
      <Navbar user={user} profile={profile} />

      <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-6 sm:pt-8">
        <Link
          href="/jogos"
          className="group inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-amber-700"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Centro de Jogos
        </Link>
      </div>

      <main className="mx-auto max-w-3xl space-y-12 px-4 pb-20 pt-2 sm:space-y-16 sm:px-6">

        {/* a) Cabeçalho */}
        <header className="space-y-4 text-center">
          <img
            src="/images/VanaTrilha.png"
            alt="Logótipo do VanaTrilha"
            className="mx-auto h-28 w-28 object-contain drop-shadow-xl sm:h-36 sm:w-36"
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">Novo jogo no site</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-[#1E3A5F] sm:text-6xl">VanaTrilha</h1>
            <p className="text-lg font-bold text-orange-600 sm:text-xl">A Rota da Promessa</p>
          </div>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-slate-700 sm:text-xl">
            Responde a perguntas da Bíblia e leva o teu peão do Egito até à Terra Prometida.
          </p>
          <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-center">
            <Link
              href="/jogos/vana-trilha"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-600 to-yellow-500 px-6 py-3 font-black text-white shadow-lg shadow-orange-500/25 transition-all hover:brightness-105 sm:w-auto"
            >
              <Play className="h-5 w-5 fill-white" /> Jogar agora
            </Link>
            <a
              href="#demo"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-amber-200 bg-white px-6 py-3 font-bold text-amber-800 transition-all hover:bg-amber-50 sm:w-auto"
            >
              Ver a demonstração <ChevronDown className="h-5 w-5" />
            </a>
          </div>
        </header>

        {/* b) O que é? */}
        <section aria-labelledby="o-que-e">
          <SectionTitle kicker="Em 10 segundos">
            <span id="o-que-e">O que é?</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { emoji: '🎯', title: 'O objetivo', text: 'Chegar ao fim da trilha.' },
              { emoji: '❓', title: 'Como avanças', text: 'Acertando nas perguntas.' },
              { emoji: '🏆', title: 'O que ganhas', text: 'XP e Gold para gastares na loja.' },
            ].map((card) => (
              <div key={card.title} className="rounded-3xl border border-amber-100 bg-white p-5 text-center shadow-sm">
                <div className="text-4xl" aria-hidden>
                  {card.emoji}
                </div>
                <p className="mt-2 text-lg font-black text-slate-900">{card.title}</p>
                <p className="text-slate-600">{card.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* c) Como se joga */}
        <section aria-labelledby="como-se-joga">
          <SectionTitle kicker="Passo a passo">
            <span id="como-se-joga">Como se joga</span>
          </SectionTitle>
          <HowToPlaySteps />
        </section>

        {/* d) Demonstração interativa */}
        <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20">
          <SectionTitle kicker="Vê acontecer">
            <span id="demo-title">Uma etapa num minuto</span>
          </SectionTitle>
          <TrailDemo />
        </section>

        {/* e) Uma etapa nova todos os dias */}
        <section aria-labelledby="todos-os-dias">
          <SectionTitle kicker="Todos os dias">
            <span id="todos-os-dias">Uma etapa nova todos os dias</span>
          </SectionTitle>
          <p className="text-lg leading-relaxed text-slate-700">
            Cada dia é uma parte diferente da viagem do povo de Israel. E{' '}
            <strong>todos os desbravadores apanham a mesma etapa no mesmo dia</strong> — dá para comparar no grupo quem
            acertou mais!
          </p>
          <ol className="mt-5 space-y-2 sm:grid sm:grid-cols-7 sm:gap-2 sm:space-y-0">
            {VANATRILHA_STATIONS.map((s, i) => {
              const theme = STATION_THEME[s.color]
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-2.5 shadow-sm sm:flex-col sm:gap-1.5 sm:p-2 sm:text-center"
                >
                  <span
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${theme.gradient} text-sm font-black text-white`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight text-slate-900">{s.name}</span>
                    <span className="block text-xs text-slate-500">{s.reference}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        {/* f) As casas especiais */}
        <section aria-labelledby="casas-especiais">
          <SectionTitle kicker="Surpresas no caminho">
            <span id="casas-especiais">As casas especiais</span>
          </SectionTitle>
          <p className="mb-4 text-slate-700">Em algumas etapas há uma casa especial. Se o teu peão parar nela:</p>
          <SpecialTilesList />
        </section>

        {/* g) O que ganhas */}
        <section aria-labelledby="o-que-ganhas">
          <SectionTitle kicker="Prémios">
            <span id="o-que-ganhas">O que ganhas</span>
          </SectionTitle>
          <div className="space-y-4">
            <RewardsTable />
            <RewardsNotes />
          </div>
        </section>

        {/* i) Perguntas frequentes */}
        <section aria-labelledby="faq">
          <SectionTitle kicker="Dúvidas">
            <span id="faq">Perguntas frequentes</span>
          </SectionTitle>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-amber-100 bg-white px-4 shadow-sm open:shadow-md"
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-amber-600 transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-4 leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* j) Fecho */}
        <section className="rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-yellow-500 p-6 text-center text-white shadow-xl sm:p-10">
          <p className="text-2xl font-black sm:text-3xl">Pronto para a viagem?</p>
          <p className="mt-1 text-white/90">A etapa de hoje já está à tua espera.</p>
          <Link
            href="/jogos/vana-trilha"
            className="mx-auto mt-5 flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-lg font-black text-orange-700 shadow-lg transition-all hover:bg-amber-50 active:scale-[0.98]"
          >
            <Play className="h-6 w-6 fill-orange-600" /> Jogar agora
          </Link>
          <p className="mt-4 text-xs text-white/90">
            Precisas de ter conta no site do clube. Fala com um dirigente se ainda não tens.
          </p>
        </section>
      </main>
    </div>
  )
}
