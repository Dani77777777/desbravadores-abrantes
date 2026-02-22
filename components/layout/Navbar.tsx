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
import { Menu, X, LogOut, User, Shield, Tent } from 'lucide-react'
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
              <Tent className="h-6 w-6 text-yellow-400" />
              <span className="hidden sm:inline">Desbravadores Abrantes</span>
              <span className="sm:hidden">DBV Abrantes</span>
            </Link>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
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
          </div>
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-blue-800 focus:ring-0">
                    <Avatar className="h-9 w-9 border-2 border-yellow-400/60">
                      <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} alt={profile?.full_name} />
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
        <div className="md:hidden pb-3 border-t border-blue-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link
              href="/"
              className="text-gray-100 hover:bg-blue-800 hover:text-white block px-3 py-2 rounded-md text-base font-medium"
              onClick={() => setIsOpen(false)}
            >
              Painel
            </Link>
            <Link
              href="/profile"
              className="text-gray-100 hover:bg-blue-800 hover:text-white block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-4 h-4" /> Perfil
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="text-gray-100 hover:bg-blue-800 hover:text-white block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                onClick={() => setIsOpen(false)}
              >
                <Shield className="w-4 h-4" /> Gestão
              </Link>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-blue-800">
            <div className="flex items-center px-5">
              <div className="flex-shrink-0">
                <Avatar className="h-10 w-10 border-2 border-yellow-400/60">
                    <AvatarImage src={profile?.avatar_url || user?.user_metadata?.avatar_url} alt={profile?.full_name} />
                    <AvatarFallback className="bg-blue-700 text-white">{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
                </Avatar>
              </div>
              <div className="ml-3">
                <div className="text-base font-medium leading-none text-white">{profile?.full_name}</div>
                <div className="text-sm font-medium leading-none text-blue-200 capitalize mt-1">
                   {profile?.role} • {profile?.section}
                </div>
              </div>
            </div>
            <div className="mt-3 px-2 space-y-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-red-300 hover:text-white hover:bg-red-900/50"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
