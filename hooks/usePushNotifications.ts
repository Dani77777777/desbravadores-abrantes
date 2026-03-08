'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  return ('standalone' in window.navigator && (window.navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported' | 'ios-needs-install'

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // On iOS Safari (not standalone), PushManager is unavailable — guide user to install PWA
      if (isIOS() && !isStandalonePWA()) {
        setPermission('ios-needs-install')
      } else {
        setPermission('unsupported')
      }
      return
    }
    setPermission(Notification.permission as PushPermission)

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [])

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.error('[Push] Service Workers or Push API not supported')
      return
    }

    setIsLoading(true)
    try {
      console.log('[Push] Registering service worker...')
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      console.log('[Push] Service worker ready:', reg)

      console.log('[Push] Requesting notification permission...')
      const perm = await Notification.requestPermission()
      setPermission(perm as PushPermission)
      console.log('[Push] Permission result:', perm)

      if (perm !== 'granted') {
        setIsLoading(false)
        return
      }

      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set!')
        return
      }

      console.log('[Push] Subscribing to push manager...')
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      console.log('[Push] Subscription created:', subscription.endpoint)

      const subJson = subscription.toJSON()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      console.log('[Push] Saving subscription to Supabase for user:', user.id)
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      }, { onConflict: 'user_id,endpoint' })

      if (error) {
        console.error('[Push] Supabase upsert error:', error)
        throw error
      }

      console.log('[Push] Subscription saved successfully! ✅')
      setIsSubscribed(true)
    } catch (err) {
      console.error('[Push] Error subscribing:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const unsubscribe = async () => {
    setIsLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', subscription.endpoint)
        }
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[Push] Error unsubscribing:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe }
}
