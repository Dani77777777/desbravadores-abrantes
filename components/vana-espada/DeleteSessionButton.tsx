'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteSession } from '@/lib/actions/vana-espada'

interface Props {
  sessionId: string
  pin: string
  /** A sessão ainda não acabou (sala de espera ou a meio do jogo). */
  live: boolean
  /** Para onde ir depois de apagar (no relatório da própria sessão, volta à lista). */
  redirectTo?: string
}

/**
 * Apagar uma sessão na gestão — o mesmo botão do VanaQuest.
 *
 * Ao contrário do VanaQuest, também deixa apagar sessões que não acabaram: são
 * quase sempre salas abandonadas (o anfitrião fechou o separador) que ficavam
 * para sempre na lista a "Retomar". Nesses casos o aviso é mais forte, porque
 * pode haver gente a jogar.
 */
export function DeleteSessionButton({ sessionId, pin, live, redirectTo }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const message = live
      ? `A sessão ${pin} ainda não terminou.\n\nSe houver pessoas a jogar, o jogo acaba para elas. Os jogadores, as respostas e as pontuações são apagados para sempre.\n\nApagar mesmo assim?`
      : `Apagar a sessão ${pin}?\n\nIsto remove para sempre os jogadores, as respostas e as pontuações desta sessão. O Gold e o XP já atribuídos mantêm-se.`
    if (!confirm(message)) return

    startTransition(async () => {
      const res = await deleteSession(sessionId)
      if (!res.ok) {
        alert(`Não foi possível apagar a sessão: ${res.error ?? 'erro desconhecido'}`)
        return
      }
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title="Apagar sessão"
      className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
