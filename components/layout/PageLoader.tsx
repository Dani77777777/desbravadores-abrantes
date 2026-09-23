import { displayFont } from '@/components/landing/fonts'

/**
 * Ecrã de carregamento do site (logo a pulsar + barra a correr).
 * Usado no app/loading.tsx (enquanto o servidor prepara a página) e no login
 * (entre o "Entrar" e o painel aparecer).
 */
export function PageLoader({
  title = 'A carregar...',
  subtitle,
  overlay = false,
}: {
  title?: string
  subtitle?: string
  /** true = por cima de tudo (position fixed); false = ocupa a página. */
  overlay?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${overlay ? 'fixed inset-0 z-[100]' : 'min-h-screen'} flex flex-col items-center justify-center bg-blue-950 px-6 text-center text-white animate-in fade-in duration-200`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(40% 35% at 50% 40%, rgba(250,204,21,.16), transparent 70%), radial-gradient(50% 40% at 0% 100%, rgba(99,102,241,.25), transparent 70%)',
        }}
      />
      <div className="relative">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-yellow-400/20" />
        <img
          src="/images/Logo Desbravadores.png"
          alt=""
          className="relative h-20 w-auto animate-pulse drop-shadow-[0_4px_20px_rgba(250,204,21,.45)]"
        />
      </div>
      <p className={`${displayFont.className} relative mt-8 text-2xl font-extrabold`}>{title}</p>
      {subtitle && <p className="relative mt-1.5 text-sm text-blue-200/70">{subtitle}</p>}
      <div className="relative mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <div className="lp-loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500" />
      </div>
    </div>
  )
}
