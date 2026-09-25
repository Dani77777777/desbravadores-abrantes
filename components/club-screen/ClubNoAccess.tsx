'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getClubApp } from '@/utils/club-screen'

/** Conta sem permissão (não é dirigente nem coordenador). Na app, deixa trocar de pessoa. */
export function ClubNoAccess() {
  const [inApp, setInApp] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setInApp(!!getClubApp()), [])

  const logout = async () => {
    await createClient()
      .auth.signOut()
      .catch(() => {})
    getClubApp()?.logout()
  }

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-950 text-yellow-300">
        <Lock className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-gray-900">Só para a liderança</h1>
      <p className="mt-2 text-gray-600">O Ecrã do Clube é usado pelos dirigentes e pela coordenação. Esta conta não tem acesso.</p>
      {inApp ? (
        <button
          type="button"
          onClick={logout}
          className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-blue-900 px-5 text-sm font-bold text-white hover:bg-blue-800"
        >
          <LogOut className="h-4 w-4" /> Entrar com outra conta
        </button>
      ) : (
        <Link href="/" className="mt-6 flex h-11 items-center rounded-xl bg-blue-900 px-5 text-sm font-bold text-white hover:bg-blue-800">
          Voltar ao início
        </Link>
      )}
    </main>
  )
}
