'use client'

import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { toast } from 'sonner'

export function PushNotificationButton() {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications()

  if (permission === 'unsupported') return null

  const handleClick = async () => {
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

  const label = isSubscribed
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
