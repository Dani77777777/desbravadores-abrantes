import type { CSSProperties } from 'react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { MessageCircle, MapPin, Mail, Instagram, Youtube, ArrowUpRight, Navigation, Star, Sparkles } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'
import { CopyEmailButton } from '@/components/contacts/CopyEmailButton'

const D = displayFont.className

/** Atraso da animação de entrada em ms. */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

export default async function ContactsPage() {
  const supabase = await createClient()

  // Try to get current user/profile for navigation consistency
  const { data: { user } } = await supabase.auth.getUser()
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  const whatsappLink = "https://chat.whatsapp.com/IfZxTuAswraCibvmg6PApu"
  const instagramLink = "https://www.instagram.com/desbravadores.abrantes/"
  const youtubeLink = "https://www.youtube.com/@DesbravadoresdeAbrantes"
  const email = "direcao.desbravadores.abrantes@gmail.com"
  const address = "Av. Defensores de Chaves 23, Abrantes"
  const simpleMapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`

  return (
    <div className="min-h-screen overflow-x-clip bg-stone-50">
      <Navbar user={user} profile={profile} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-950 pb-40 pt-16 text-white md:pb-48 md:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(50% 60% at 15% 20%, rgba(16,185,129,.25), transparent 70%), radial-gradient(45% 55% at 85% 30%, rgba(236,72,153,.25), transparent 70%), radial-gradient(50% 50% at 50% 100%, rgba(59,130,246,.35), transparent 70%)',
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
        <Star aria-hidden className="lp-spin absolute -right-10 top-10 hidden h-32 w-32 fill-yellow-400/20 text-yellow-400/20 md:block" />
        <Star aria-hidden className="lp-spin absolute -left-8 bottom-16 hidden h-20 w-20 fill-red-500/25 text-red-500/25 md:block" />

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div
            className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300 backdrop-blur"
            style={delay(0)}
          >
            <Sparkles className="h-3.5 w-3.5" /> Contactos
          </div>
          <h1
            className={`${D} lp-rise mt-6 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl md:text-8xl`}
            style={delay(120)}
          >
            Fala{' '}
            <span className="lp-shimmer bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
              connosco!
            </span>
          </h1>
          <p
            className="lp-rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-blue-100/85 sm:text-xl"
            style={delay(240)}
          >
            Estamos prontos para te receber. Escolhe a forma mais fácil de
            chegares até nós.
          </p>
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-28 max-w-7xl space-y-20 px-4 pb-24 sm:px-6 md:-mt-32 lg:px-8">
        {/* ── Canais de contacto ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {/* WhatsApp */}
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-rise group relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-400 to-emerald-600 p-7 text-white shadow-xl shadow-emerald-900/25 transition-all duration-300 hover:-translate-y-1.5 hover:-rotate-1 md:p-8"
            style={delay(300)}
          >
            <MessageCircle aria-hidden className="absolute -bottom-8 -right-8 h-44 w-44 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12" />
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
                <MessageCircle className="h-7 w-7" />
              </div>
              <ArrowUpRight className="h-6 w-6 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <h2 className={`${D} mt-6 text-3xl font-extrabold`}>WhatsApp</h2>
            <p className="relative mt-2 flex-1 text-emerald-50">
              Entra no grupo de interessados e recebe as novidades todas em
              primeira mão.
            </p>
            <span className="relative mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 font-extrabold text-emerald-700 shadow-md transition-colors group-hover:bg-emerald-50">
              Entrar no grupo
            </span>
          </a>

          {/* Instagram */}
          <a
            href={instagramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-rise group relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 p-7 text-white shadow-xl shadow-pink-900/25 transition-all duration-300 hover:-translate-y-1.5 hover:rotate-1 md:p-8"
            style={delay(400)}
          >
            <Instagram aria-hidden className="absolute -bottom-8 -right-8 h-44 w-44 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12" />
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
                <Instagram className="h-7 w-7" />
              </div>
              <ArrowUpRight className="h-6 w-6 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <h2 className={`${D} mt-6 text-3xl font-extrabold`}>Instagram</h2>
            <p className="relative mt-2 flex-1 text-pink-50">
              Segue as nossas aventuras do dia a dia e vê as fotos do clube.
            </p>
            <span className="relative mt-7 inline-flex items-center justify-center gap-2 truncate rounded-xl bg-white px-4 py-3.5 font-extrabold text-pink-600 shadow-md transition-colors group-hover:bg-pink-50">
              @desbravadores.abrantes
            </span>
          </a>

          {/* YouTube */}
          <a
            href={youtubeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-rise group relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-red-500 to-red-700 p-7 text-white shadow-xl shadow-red-900/25 transition-all duration-300 hover:-translate-y-1.5 hover:-rotate-1 md:p-8"
            style={delay(500)}
          >
            <Youtube aria-hidden className="absolute -bottom-8 -right-8 h-44 w-44 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12" />
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
                <Youtube className="h-7 w-7" />
              </div>
              <ArrowUpRight className="h-6 w-6 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <h2 className={`${D} mt-6 text-3xl font-extrabold`}>YouTube</h2>
            <p className="relative mt-2 flex-1 text-red-50">
              Vê os vídeos dos nossos acampamentos, atividades e cerimónias.
            </p>
            <span className="relative mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 font-extrabold text-red-600 shadow-md transition-colors group-hover:bg-red-50">
              Ver o canal
            </span>
          </a>

          {/* Email */}
          <div
            className="lp-rise group relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-500 to-indigo-700 p-7 text-white shadow-xl shadow-blue-900/25 md:p-8"
            style={delay(600)}
          >
            <Mail aria-hidden className="absolute -bottom-8 -right-8 h-44 w-44 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12" />
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
              <Mail className="h-7 w-7" />
            </div>
            <h2 className={`${D} mt-6 text-3xl font-extrabold`}>Email</h2>
            <p className="relative mt-2 flex-1 text-blue-100">
              Para assuntos administrativos ou parcerias institucionais.
            </p>
            <p className="relative mt-6 rounded-xl bg-blue-950/30 px-4 py-3 text-center text-sm font-bold select-all">
              direcao.desbravadores.abrantes<wbr />@gmail.com
            </p>
            <div className="relative mt-3 grid grid-cols-2 gap-2">
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 font-extrabold text-blue-700 shadow-md transition-colors hover:bg-blue-50"
              >
                Enviar
              </a>
              <CopyEmailButton email={email} />
            </div>
          </div>
        </div>

        {/* ── Onde estamos ───────────────────────────────────── */}
        <section className="relative">
          <div className="overflow-hidden rounded-[2rem] bg-white p-2 shadow-2xl shadow-blue-950/15 ring-1 ring-stone-200 sm:p-3">
            <div className="h-[360px] overflow-hidden rounded-[1.5rem] md:h-[520px]">
              <iframe
                title="Mapa com a localização do clube"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={simpleMapsUrl}
              ></iframe>
            </div>
          </div>

          {/* Cartão da morada por cima do mapa em ecrãs grandes; por baixo dele nos outros */}
          <div className="relative mx-auto -mt-10 max-w-md px-3 lg:absolute lg:left-8 lg:top-28 lg:mt-0 lg:max-w-sm lg:px-0">
            <div className="-rotate-1 rounded-[1.75rem] bg-blue-950 p-7 text-white shadow-2xl ring-4 ring-white">
              <span className="inline-flex -rotate-2 items-center rounded-lg bg-yellow-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-blue-950">
                Onde estamos
              </span>
              <h2 className={`${D} mt-4 text-3xl font-extrabold leading-tight`}>
                Vem ter connosco!
              </h2>
              <p className="mt-3 flex items-start gap-2 text-lg text-blue-100">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-red-400" />
                <span className="font-medium">{address}</span>
              </p>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 py-3.5 font-extrabold text-blue-950 shadow-[0_14px_30px_-10px_rgba(250,204,21,.7)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300"
              >
                Como chegar
                <Navigation className="h-4 w-4 transition-transform group-hover:rotate-12" />
              </a>
            </div>
          </div>
        </section>

        {/* ── Ainda tens perguntas? ──────────────────────────── */}
        <section className="relative overflow-hidden rounded-[2.5rem] bg-yellow-400 px-6 py-16 text-center text-blue-950 shadow-2xl shadow-yellow-700/20 md:px-16 md:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #172554 1.5px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <Star aria-hidden className="lp-spin absolute -left-10 -top-10 h-36 w-36 fill-orange-400/60 text-orange-400/60" />
          <Star aria-hidden className="lp-spin absolute -bottom-12 -right-8 h-44 w-44 fill-red-500/40 text-red-500/40" />
          <div className="relative z-10 mx-auto max-w-3xl">
            <h2 className={`${D} text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl md:text-6xl`}>
              Ainda tens perguntas?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg font-medium leading-relaxed text-blue-950/75">
              Não hesites em falar connosco! Respondemos com todo o gosto a
              dúvidas sobre inscrições ou sobre o que é ser Desbravador.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-full bg-blue-950 px-8 py-4 text-lg font-extrabold text-white shadow-[0_18px_40px_-12px_rgba(23,37,84,.7)] transition-all hover:-translate-y-1 hover:bg-blue-900"
              >
                <MessageCircle className="h-5 w-5" /> Pergunta no WhatsApp
              </a>
              <span className="inline-flex rotate-2 items-center rounded-full bg-white px-6 py-3 font-extrabold shadow-lg">
                Sempre prontos para servir!
              </span>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
