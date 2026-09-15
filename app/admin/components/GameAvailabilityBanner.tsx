import Link from 'next/link'
import { Lock } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { fetchGameSetting, gameAvailabilitySummary, getGame } from '@/utils/games'

/** Aviso nas páginas de gestão de um jogo quando ele não está disponível para todos. */
export async function GameAvailabilityBanner({ gameId }: { gameId: string }) {
  const supabase = await createClient()
  const setting = await fetchGameSetting(supabase, gameId)
  const summary = gameAvailabilitySummary(setting)
  if (summary.tone === 'green') return null

  const title = getGame(gameId)?.title ?? gameId
  const isOff = summary.tone === 'red'

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
        isOff ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="flex items-center gap-2">
        <Lock className="h-4 w-4 flex-shrink-0" />
        <span>
          {isOff ? (
            <><strong>{title} está desativado.</strong> Ninguém consegue entrar no jogo.</>
          ) : (
            <><strong>{title}: {summary.label.toLowerCase()}.</strong> Os restantes veem o jogo como indisponível.</>
          )}
        </span>
      </p>
      <Link href="/admin?tab=games" className="font-bold underline underline-offset-2 hover:no-underline">
        Alterar disponibilidade
      </Link>
    </div>
  )
}
