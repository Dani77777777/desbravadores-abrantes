import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Compass, Gamepad2, Tent, Star } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'

const D = displayFont.className

/**
 * Moldura das páginas de autenticação (login/registo e onboarding):
 * foto do clube à esquerda em ecrãs grandes, formulário à direita.
 */
export function AuthShell({
  children,
  asideTitle,
  asideText,
  showBackLink = true,
}: {
  children: React.ReactNode
  asideTitle: React.ReactNode
  asideText: string
  showBackLink?: boolean
}) {
  return (
    <div className="grid min-h-screen bg-blue-950 lg:grid-cols-[1.05fr_1fr]">
      {/* ── Painel com a foto (só desktop) ─────────────────── */}
      <aside className="relative hidden overflow-hidden lg:block">
        <Image
          src="/images/desbravadores todos 2.jpg"
          alt="Membros do Clube de Desbravadores de Abrantes"
          fill
          priority
          sizes="50vw"
          className="object-cover object-[50%_40%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-950/55 to-blue-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-blue-950/60" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" className="flex w-fit items-center gap-2.5 text-white">
            <img src="/images/Logo Desbravadores.png" alt="Logo" className="h-10 w-auto drop-shadow-[0_2px_8px_rgba(250,204,21,.3)]" />
            <span className={`${D} text-xl font-extrabold`}>
              Desbravadores <span className="text-yellow-400">Abrantes</span>
            </span>
          </Link>

          <div className="text-white">
            <h2 className={`${D} max-w-lg text-5xl font-extrabold leading-[0.95] tracking-tight xl:text-6xl`}>
              {asideTitle}
            </h2>
            <p className="mt-4 max-w-md text-lg text-blue-100/85">{asideText}</p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {[
                { icon: Tent, label: 'Acampamentos' },
                { icon: Compass, label: 'Especialidades' },
                { icon: Gamepad2, label: 'Jogos & XP' },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-blue-50 ring-1 ring-inset ring-white/15 backdrop-blur"
                >
                  <Icon className="h-4 w-4 text-yellow-300" /> {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Selo a rodar */}
        <div className="absolute right-10 top-10 h-28 w-28 rounded-full bg-red-500 shadow-xl ring-4 ring-blue-950/60">
          <svg viewBox="0 0 120 120" className="lp-spin h-full w-full">
            <defs>
              <path id="auth-circle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
            </defs>
            <text className="fill-white text-[11px] font-extrabold uppercase" textLength="272" lengthAdjust="spacing">
              <textPath href="#auth-circle">Aventura • Amizade • Fé •</textPath>
            </text>
          </svg>
          <Star className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 fill-yellow-300 text-yellow-300" />
        </div>
      </aside>

      {/* ── Formulário ─────────────────────────────────────── */}
      <main className="relative flex min-h-screen flex-col overflow-hidden px-4 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(55% 45% at 100% 0%, rgba(250,204,21,.18), transparent 70%), radial-gradient(55% 45% at 0% 100%, rgba(99,102,241,.3), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        {showBackLink && (
          <Link
            href="/"
            className="relative z-10 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-blue-100/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
        )}

        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          {/* Logo no telemóvel (no desktop está no painel da foto) */}
          <Link href="/" className="lp-rise mx-auto mb-7 flex items-center gap-2.5 text-white lg:hidden">
            <img src="/images/Logo Desbravadores.png" alt="Logo" className="h-11 w-auto drop-shadow-[0_2px_8px_rgba(250,204,21,.3)]" />
            <span className={`${D} text-xl font-extrabold leading-none`}>
              Desbravadores <span className="text-yellow-400">Abrantes</span>
            </span>
          </Link>

          {children}

          <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-300/50">
            Aventura • Amizade • Fé
          </p>
        </div>
      </main>
    </div>
  )
}
