import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { MessageSquare, Users, PenLine, Trophy } from 'lucide-react'
import { SuggestionsForm } from './SuggestionsForm'
import { redirect } from 'next/navigation'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'

const D = displayFont.className

export default async function SuggestionsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  const { data: suggestions } = await supabase
    .from('suggestions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const steps = [
    { icon: Users, title: 'Escolhe', text: 'para quem é' },
    { icon: PenLine, title: 'Escreve', text: 'o que sentes' },
    { icon: Trophy, title: 'Bónus', text: 'boas ideias podem dar XP e Gold' },
  ]

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-24 pt-12 text-white md:pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 55% at 90% 20%, rgba(139,92,246,.3), transparent 70%), radial-gradient(40% 50% at 5% 70%, rgba(250,204,21,.15), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />
        <MessageSquare aria-hidden className="lp-float absolute right-[8%] top-12 hidden h-20 w-20 -rotate-12 text-violet-400/20 lg:block" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8 lg:text-left">
          <span className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">
            <MessageSquare className="h-3.5 w-3.5" /> Sugestões e Críticas
          </span>
          <h1
            className={`${D} lp-rise mt-5 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl`}
            style={{ '--d': '100ms' } as React.CSSProperties}
          >
            A tua voz{' '}
            <span className="lp-shimmer bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
              conta.
            </span>
          </h1>
          <p className="lp-rise mx-auto mt-5 max-w-2xl text-lg text-blue-100/80 lg:mx-0" style={{ '--d': '200ms' } as React.CSSProperties}>
            A tua voz ajuda-nos a construir um clube melhor. Partilha as tuas ideias ou preocupações de forma segura.
          </p>
          <ol className="lp-rise mt-7 flex flex-wrap justify-center gap-2.5 lg:justify-start" style={{ '--d': '300ms' } as React.CSSProperties}>
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] py-2 pl-2 pr-4 ring-1 ring-inset ring-white/10">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-400 text-blue-950">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-left text-sm leading-tight">
                  <span className="font-extrabold text-white">{i + 1}. {title}</span>
                  <span className="block text-xs text-blue-100/70">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Conteúdo ──────────────────────────────────────────── */}
      <div className="relative -mt-10 rounded-t-[2.5rem] bg-stone-50 pb-20 pt-10">
        <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SuggestionsForm initialSuggestions={suggestions || []} userId={user.id} />
        </main>
      </div>

      <SiteFooter />
    </div>
  )
}
