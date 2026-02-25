'use client'

import { useState } from 'react'
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
import { Menu, X, LogOut, User, Shield, Tent, MessageSquare, Trophy, Phone, ShoppingBag } from 'lucide-react'
import { PushNotificationButton } from '@/components/notifications/PushNotificationButton'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

interface NavbarProps {
  user: any
  profile: any
}

export function Navbar({ user, profile }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'

  return (
    <nav className="bg-blue-900 border-b border-blue-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 font-bold text-xl tracking-tight flex items-center gap-2">
              <img src="/images/Logo Desbravadores.png" alt="Logo" className="h-8 w-auto" />
              <span className="hidden sm:inline">Desbravadores Abrantes</span>
              <span className="sm:hidden">DBV Abrantes</span>
            </Link>
            {user && (
              <div className="hidden md:block">
                <div className="ml-10 flex items-center space-x-4">
                  <Link
                    href="/"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Painel
                  </Link>
                  <Link
                    href="/profile"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <User className="w-4 h-4" /> Perfil
                  </Link>
                  <Link
                    href="/suggestions"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <MessageSquare className="w-4 h-4" /> Sugestões
                  </Link>
                  <Link
                    href="/leaderboard"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <Trophy className="w-4 h-4" /> Ranking
                  </Link>
                  <Link
                    href="/contacts"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <Phone className="w-4 h-4" /> Contactos
                  </Link>
                  <Link
                    href="/shop"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <ShoppingBag className="w-4 h-4" /> Loja
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      <Shield className="w-4 h-4" /> Gestão
                    </Link>
                  )}
                </div>
              </div>
            )}
            {!user && (
              <div className="hidden md:block">
                <div className="ml-10 flex items-center space-x-4">
                  <Link
                    href="/leaderboard"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 text-white"
                  >
                    <Trophy className="w-4 h-4" /> Ranking
                  </Link>
                  <Link
                    href="/contacts"
                    className="hover:bg-blue-800 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 text-white"
                  >
                    <Phone className="w-4 h-4" /> Contactos
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6 gap-1">
              {user && <PushNotificationButton />}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-blue-800 focus:ring-0">
                      <Avatar className="h-9 w-9 border-2 border-yellow-400/60">
                        <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} alt={profile?.full_name} className="object-cover" />
                        <AvatarFallback className="bg-blue-700 text-white">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                        <p className="text-xs leading-none text-muted-foreground capitalize">
                          {profile?.role} • {profile?.section}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sair</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/login?mode=login">
                    <Button variant="ghost" className="text-white hover:bg-blue-800 font-medium">
                      Entrar
                    </Button>
                  </Link>
                  <Link href="/login?mode=signup">
                    <Button className="bg-white text-blue-900 hover:bg-yellow-400 hover:text-blue-900 border-none font-bold shadow-sm transition-colors">
                      Registar
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
          <div className="-mr-2 flex md:hidden">
            <Button
              variant="ghost"
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-blue-200 hover:text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 focus:ring-white"
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-[60] bg-blue-900/98 backdrop-blur-xl animate-in fade-in duration-300">
          {/* Close button inside the overlay for better UX */}
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-8 h-8" />
          </button>

          <div className="px-5 py-20 flex flex-col h-full overflow-y-auto">
            <div className="flex-1 space-y-3">
              {user ? (
                <>
                  <Link
                    href="/"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-blue-800/40 hover:bg-blue-800 text-white font-bold transition-all border border-blue-700/50 shadow-sm"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-white rounded-lg">
                      <img src="/images/Logo Desbravadores.png" alt="Logo" className="w-5 h-5 object-contain" />
                    </div>
                    <span>Painel Principal</span>
                  </Link>
                  <Link
                    href="/profile"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <User className="w-5 h-5" />
                    </div>
                    <span>O Meu Perfil</span>
                  </Link>
                  <Link
                    href="/suggestions"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <span>Sugestões</span>
                  </Link>
                  <Link
                    href="/leaderboard"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <span>Ranking</span>
                  </Link>
                  <Link
                    href="/contacts"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <Phone className="w-5 h-5" />
                    </div>
                    <span>Contactos</span>
                  </Link>
                  <Link
                    href="/shop"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <span>Loja de Gold</span>
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="mt-4 flex items-center gap-4 px-5 py-4 rounded-2xl bg-red-600/10 hover:bg-red-600/20 text-red-400 font-bold transition-all border border-red-500/20"
                      onClick={() => setIsOpen(false)}
                    >
                      <div className="p-2 bg-red-600/20 rounded-lg">
                        <Shield className="w-5 h-5" />
                      </div>
                      <span>Área de Gestão</span>
                    </Link>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <Link
                    href="/leaderboard"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-blue-800/40 hover:bg-blue-800 text-white font-bold transition-all border border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-white rounded-lg">
                      <img src="/images/Logo Desbravadores.png" alt="Logo" className="w-5 h-5 object-contain" />
                    </div>
                    <span>Ranking Público</span>
                  </Link>
                  <Link
                    href="/contacts"
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-blue-800/40 text-gray-100 font-semibold transition-all border border-transparent hover:border-blue-700/50"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="p-2 bg-blue-700/50 rounded-lg text-blue-300">
                      <Phone className="w-5 h-5" />
                    </div>
                    <span>Contactos do Clube</span>
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-blue-800/60 pb-10">
              {user ? (
                <div className="space-y-8">
                  <div className="flex items-center px-2">
                    <div className="relative">
                      <Avatar className="h-16 w-16 border-2 border-yellow-400 shadow-lg">
                          <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} alt={profile?.full_name} className="object-cover" />
                          <AvatarFallback className="bg-blue-700 text-white text-xl font-bold">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-2 border-blue-900 rounded-full" />
                    </div>
                    <div className="ml-5">
                      <div className="text-xl font-bold text-white tracking-tight leading-none mb-1">{profile?.full_name}</div>
                      <div className="text-sm text-blue-300 font-medium capitalize flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-blue-400" />
                         {profile?.role} • {profile?.section}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <PushNotificationButton />
                    <Button
                      variant="ghost"
                      className="flex-1 justify-center text-red-100 hover:text-white hover:bg-red-600/20 py-8 text-lg font-bold rounded-2xl border border-red-900/30 transition-all active:scale-95"
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-3 h-5 w-5 text-red-400" /> Encerrar Sessão
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Link href="/login?mode=signup" onClick={() => setIsOpen(false)}>
                    <Button className="w-full bg-yellow-400 text-blue-900 hover:bg-yellow-500 py-8 text-xl font-bold rounded-2xl border-none shadow-xl transform transition-transform active:scale-[0.98]">
                      Registar agora
                    </Button>
                  </Link>
                  <Link href="/login?mode=login" onClick={() => setIsOpen(false)}>
                    <Button variant="ghost" className="w-full border border-blue-400/30 text-white hover:bg-blue-800/50 py-7 text-lg font-semibold rounded-2xl">
                      Já tenho conta
                    </Button>
                  </Link>
                </div>
              )}
              <div className="text-center mt-12">
                <p className="text-[10px] text-blue-400/60 font-medium tracking-widest uppercase">
                  Aventura • Amizade • Fé
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
