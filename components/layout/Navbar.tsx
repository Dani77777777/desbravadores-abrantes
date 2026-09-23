'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Menu, X, LogOut, User, Shield, MessageSquare, Trophy, Phone, ShoppingBag, Gamepad2, Home, Coins, ChevronDown, type LucideIcon } from 'lucide-react'
import { PushNotificationButton } from '@/components/notifications/PushNotificationButton'
import { createClient } from '@/utils/supabase/client'
import { usePathname, useRouter } from 'next/navigation'
import { isAdminRole, isHelper, helperLabel } from '@/utils/permissions'
import { displayFont } from '@/components/landing/fonts'

interface NavbarProps {
  user: any
  profile: any
}

interface NavItem {
  href: string
  label: string
  /** Texto mais descritivo no menu do telemóvel. */
  mobileLabel?: string
  icon: LucideIcon
  /** Cor do ícone no menu do telemóvel. */
  tile: string
}

const USER_ITEMS: NavItem[] = [
  { href: '/', label: 'Painel', mobileLabel: 'Painel Principal', icon: Home, tile: 'bg-blue-500' },
  { href: '/profile', label: 'Perfil', mobileLabel: 'O Meu Perfil', icon: User, tile: 'bg-sky-500' },
  { href: '/suggestions', label: 'Sugestões', icon: MessageSquare, tile: 'bg-violet-500' },
  { href: '/leaderboard', label: 'Ranking', icon: Trophy, tile: 'bg-yellow-500' },
  { href: '/contacts', label: 'Contactos', icon: Phone, tile: 'bg-emerald-500' },
  { href: '/shop', label: 'Loja', icon: ShoppingBag, tile: 'bg-pink-500' },
  { href: '/jogos', label: 'Jogos', icon: Gamepad2, tile: 'bg-orange-500' },
]

const GUEST_ITEMS: NavItem[] = [
  { href: '/jogos', label: 'Jogos', icon: Gamepad2, tile: 'bg-orange-500' },
  { href: '/shop', label: 'Loja', icon: ShoppingBag, tile: 'bg-pink-500' },
  { href: '/leaderboard', label: 'Ranking', mobileLabel: 'Ranking Público', icon: Trophy, tile: 'bg-yellow-500' },
  { href: '/contacts', label: 'Contactos', mobileLabel: 'Contactos do Clube', icon: Phone, tile: 'bg-emerald-500' },
]

const ADMIN_ITEM: NavItem = { href: '/admin', label: 'Gestão', mobileLabel: 'Área de Gestão', icon: Shield, tile: 'bg-red-500' }

export function Navbar({ user, profile }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  // Fundo translúcido só depois de descer mais do que a altura da barra (64px).
  // Antes disso, por trás do header está o espaço que ele ocupa no início da página,
  // que em várias páginas tem fundo claro e deixava a barra "lavada".
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sem scroll da página por trás do menu do telemóvel
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen])

  const isAdmin = isAdminRole(profile)
  const roleLabel = isHelper(profile) ? helperLabel(profile) : `${profile?.role} • ${profile?.section}`
  const avatarSrc = profile?.avatar_url || user?.user_metadata?.avatar_url

  const items = user ? [...USER_ITEMS, ...(isAdmin ? [ADMIN_ITEM] : [])] : GUEST_ITEMS
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(href + '/')

  // Com sessão há muitos links: o menu completo só aparece a partir de lg.
  const desktopOnly = user ? 'hidden lg:flex' : 'hidden md:flex'
  const mobileOnly = user ? 'flex lg:hidden' : 'flex md:hidden'

  return (
    <nav className="sticky top-0 z-50 text-white shadow-lg shadow-blue-950/20">
      {/* Fundo numa camada à parte (o <nav> não pode ter filtros, senão prende o menu do
          telemóvel, que é position: fixed, dentro da barra). Sólido no topo, translúcido
          quando já só há conteúdo da página por trás. */}
      <div
        aria-hidden
        className={`absolute inset-0 -z-10 transition-colors duration-300 ${
          scrolled ? 'bg-blue-950/80 backdrop-blur-xl' : 'bg-blue-950'
        }`}
      />
      {/* Linha com as cores do lenço */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 opacity-80" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <img
              src="/images/Logo Desbravadores.png"
              alt="Logo"
              className="h-9 w-auto drop-shadow-[0_2px_8px_rgba(250,204,21,.25)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
            />
            <span className={`${displayFont.className} text-lg font-extrabold leading-none tracking-tight sm:text-xl`}>
              <span className={user ? 'xl:hidden' : 'sm:hidden'}>DBV <span className="text-yellow-400">Abrantes</span></span>
              <span className={user ? 'hidden xl:inline' : 'hidden sm:inline'}>
                Desbravadores <span className="text-yellow-400">Abrantes</span>
              </span>
            </span>
          </Link>

          {/* Links (desktop) */}
          <div className={`${desktopOnly} min-w-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-1 ring-1 ring-inset ring-white/10`}>
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)
              const isAdminLink = href === '/admin'
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-yellow-400 text-blue-950 shadow-md'
                      : isAdminLink
                        ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200'
                        : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {/* Com sessão são 8 links: só texto, para caber ao lado do nome e do avatar */}
                  {!user && <Icon className="h-4 w-4" />}
                  {label}
                </Link>
              )
            })}
          </div>

          {/* Lado direito (desktop) */}
          <div className={`${desktopOnly} shrink-0 items-center gap-1.5`}>
            {user ? (
              <>
                <Link
                  href="/points-history"
                  title="O teu Gold"
                  className="hidden items-center gap-1.5 rounded-full bg-yellow-400/10 px-3 py-1.5 text-sm font-extrabold text-yellow-300 ring-1 ring-inset ring-yellow-400/25 transition-colors hover:bg-yellow-400/20 xl:flex"
                >
                  <Coins className="h-4 w-4" /> {profile?.current_gold ?? 0}
                </Link>
                <PushNotificationButton />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="group flex cursor-pointer items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
                      <Avatar className="h-9 w-9 ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-blue-950">
                        <AvatarImage src={avatarSrc} alt={profile?.full_name} className="object-cover" />
                        <AvatarFallback className="bg-blue-700 font-bold text-white">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-4 w-4 text-blue-200 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-60 rounded-2xl p-2" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={avatarSrc} alt={profile?.full_name} className="object-cover" />
                          <AvatarFallback className="bg-blue-700 font-bold text-white">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold leading-tight">{profile?.full_name}</p>
                          <p className="truncate text-xs capitalize text-muted-foreground">{roleLabel}</p>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
                      <Link href="/profile">
                        <User className="mr-2 h-4 w-4" /> O meu perfil
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
                      <Link href="/points-history">
                        <Coins className="mr-2 h-4 w-4" /> {profile?.current_gold ?? 0} Gold · Histórico
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer rounded-lg text-red-600 focus:text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sair</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link
                  href="/login?mode=login"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Entrar
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="rounded-full bg-yellow-400 px-5 py-2 text-sm font-extrabold text-blue-950 shadow-[0_0_0_3px_rgba(250,204,21,.18),0_8px_20px_-6px_rgba(250,204,21,.6)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300"
                >
                  Registar
                </Link>
              </>
            )}
          </div>

          {/* Botão do menu (telemóvel) */}
          <div className={`${mobileOnly} items-center gap-1`}>
            {!user && (
              <Link
                href="/login?mode=signup"
                className="rounded-full bg-yellow-400 px-4 py-1.5 text-sm font-extrabold text-blue-950"
              >
                Registar
              </Link>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-blue-100 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
            >
              <span className="sr-only">Abrir menu</span>
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu (telemóvel) */}
      {isOpen && (
        <div className={`${user ? 'lg:hidden' : 'md:hidden'} fixed inset-0 z-[60] overflow-y-auto bg-blue-950 animate-in fade-in duration-200`}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(60% 40% at 100% 0%, rgba(250,204,21,.18), transparent 70%), radial-gradient(60% 40% at 0% 100%, rgba(99,102,241,.25), transparent 70%)',
            }}
          />

          <div className="relative mx-auto flex min-h-full max-w-md flex-col px-5 pb-10 pt-4">
            <div className="flex items-center justify-between">
              <span className={`${displayFont.className} text-xl font-extrabold`}>
                Menu<span className="text-yellow-400">.</span>
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="sr-only">Fechar menu</span>
                <X className="h-5 w-5" />
              </button>
            </div>

            {user && (
              <div className="mt-6 flex items-center gap-4 rounded-3xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10">
                <div className="relative">
                  <Avatar className="h-14 w-14 ring-2 ring-yellow-400 ring-offset-2 ring-offset-blue-950">
                    <AvatarImage src={avatarSrc} alt={profile?.full_name} className="object-cover" />
                    <AvatarFallback className="bg-blue-700 text-xl font-bold text-white">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-blue-950 bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold leading-tight">{profile?.full_name}</p>
                  <p className="truncate text-sm capitalize text-blue-300">{roleLabel}</p>
                </div>
                <Link
                  href="/points-history"
                  onClick={() => setIsOpen(false)}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-extrabold text-blue-950"
                >
                  <Coins className="h-4 w-4" /> {profile?.current_gold ?? 0}
                </Link>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              {items.map(({ href, label, mobileLabel, icon: Icon, tile }, i) => {
                const active = isActive(href)
                const isAdminLink = href === '/admin'
                // Número ímpar de itens: o último ocupa a linha toda
                const fullRow = items.length % 2 === 1 && i === items.length - 1
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex flex-col gap-3 rounded-3xl p-4 transition-all active:scale-95 ${
                      fullRow ? 'col-span-2' : ''
                    } ${
                      active
                        ? 'bg-yellow-400 text-blue-950 shadow-[0_12px_30px_-10px_rgba(250,204,21,.6)]'
                        : isAdminLink
                          ? 'bg-red-500/10 text-red-200 ring-1 ring-inset ring-red-400/25'
                          : 'bg-white/[0.07] text-white ring-1 ring-inset ring-white/10 hover:bg-white/[0.12]'
                    }`}
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md ${active ? 'bg-blue-950' : tile}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-bold leading-tight">{mobileLabel ?? label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="mt-auto pt-8">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl ring-1 ring-inset ring-white/15">
                    <PushNotificationButton />
                  </div>
                  <Button
                    variant="ghost"
                    className="flex-1 justify-center rounded-2xl border border-red-400/25 py-7 text-base font-bold text-red-200 transition-all hover:bg-red-600/20 hover:text-white active:scale-95"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-5 w-5 text-red-400" /> Encerrar Sessão
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    href="/login?mode=signup"
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl bg-yellow-400 py-5 text-center text-xl font-extrabold text-blue-950 shadow-[0_18px_40px_-12px_rgba(250,204,21,.6)] transition-transform active:scale-[0.98]"
                  >
                    Registar agora
                  </Link>
                  <Link
                    href="/login?mode=login"
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl py-4 text-center text-lg font-semibold text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10"
                  >
                    Já tenho conta
                  </Link>
                </div>
              )}
              <p className="mt-8 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-300/50">
                Aventura • Amizade • Fé
              </p>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
