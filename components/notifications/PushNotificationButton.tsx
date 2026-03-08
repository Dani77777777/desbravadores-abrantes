'use client'

import { Bell, BellOff, BellRing, Loader2, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { toast } from 'sonner'

export function PushNotificationButton() {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications()

  // Truly unsupported (non-iOS old browsers, etc.) — hide the button
  if (permission === 'unsupported') return null

  const handleClick = async () => {
    // iOS Safari — show install instructions
    if (permission === 'ios-needs-install') {
      toast(
        <div className="flex flex-col gap-2">
          <p className="font-bold text-sm">📲 Instala a App para receber notificações</p>
          <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Toca no botão <strong>Partilhar</strong> (ícone <Share className="inline h-3 w-3" />) no Safari</li>
            <li>Seleciona <strong>&quot;Adicionar ao ecrã principal&quot;</strong></li>
            <li>Abre a app a partir do ecrã principal</li>
            <li>Toca no 🔔 para ativar notificações</li>
          </ol>
        </div>,
        { duration: 10000 }
      )
      return
    }

    if (isSubscribed) {
      await unsubscribe()
      toast.info('Notificações desativadas.')
    } else {
      await subscribe()
      if (Notification.permission === 'denied') {
        toast.error('Permissão negada. Ativa as notificações nas definições do browser.')
      } else if (Notification.permission === 'granted') {
        toast.success('Notificações ativadas! 🔔')
      }
    }
  }

  const label = permission === 'ios-needs-install'
    ? 'Instalar app para notificações'
    : isSubscribed
      ? 'Desativar notificações'
      : permission === 'denied'
        ? 'Notificações bloqueadas'
        : 'Ativar notificações'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isLoading || permission === 'denied'}
      className="text-white hover:bg-blue-800 relative"
      aria-label={label}
      title={label}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : permission === 'ios-needs-install' ? (
        <Bell className="h-5 w-5 text-orange-300" />
      ) : isSubscribed ? (
        <BellRing className="h-5 w-5 text-yellow-400" />
      ) : permission === 'denied' ? (
        <BellOff className="h-5 w-5 text-gray-400" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
    </Button>
  )
}

