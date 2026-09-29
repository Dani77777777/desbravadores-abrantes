'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote, CheckCircle2, Clock, PackageCheck, Undo2, XCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { canSelfCancel, formatEur } from '@/lib/store-economy'
import { GUEST_ORDERS_EVENT, readGuestOrders, removeGuestOrder, writeGuestOrders } from '@/lib/guest-orders'

interface Order {
  id: string
  cancel_token?: string | null
  status: string
  paid_at: string | null
  created_at: string
  quantity: number
  amount_due_eur: number
  product_name: string
  is_preorder: boolean
}

interface MyOrdersProps {
  // Membro: encomendas pendentes vindas do servidor. Convidado: null (lê do dispositivo).
  memberOrders: any[] | null
}

const fromMember = (o: any): Order => ({
  id: o.id,
  status: o.status,
  paid_at: o.paid_at,
  created_at: o.created_at,
  quantity: o.quantity || 1,
  amount_due_eur: Number(o.amount_due_eur) || 0,
  product_name: o.store_products?.name || 'Artigo',
  is_preorder: !!o.store_products?.is_preorder,
})

export function MyOrders({ memberOrders }: MyOrdersProps) {
  const supabase = createClient()
  const router = useRouter()
  const isGuest = memberOrders === null
  const [guestOrders, setGuestOrders] = useState<Order[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const loadGuestOrders = useCallback(async () => {
    const refs = readGuestOrders()
    if (refs.length === 0) {
      setGuestOrders([])
      return
    }
    const { data, error } = await supabase.rpc('get_guest_purchases', { p_tokens: refs.map(r => r.token) })
    if (error || !Array.isArray(data)) return
    // Só ficam no dispositivo os pedidos em aberto: entregues, cancelados pela
    // direção (mostrados uma última vez) ou apagados são esquecidos.
    const open = new Set(data.filter((o: any) => o.status === 'pending').map((o: any) => o.id))
    writeGuestOrders(refs.filter(r => open.has(r.id)))
    setGuestOrders(
      data
        .filter((o: any) => o.status !== 'delivered')
        .map((o: any) => ({ ...o, amount_due_eur: Number(o.amount_due_eur) || 0 }))
    )
  }, [supabase])

  useEffect(() => {
    if (!isGuest) return
    loadGuestOrders()
    const onChange = () => loadGuestOrders()
    window.addEventListener(GUEST_ORDERS_EVENT, onChange)
    return () => window.removeEventListener(GUEST_ORDERS_EVENT, onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest])

  const orders = isGuest ? guestOrders : (memberOrders || []).map(fromMember)
  if (orders.length === 0) return null

  const handleCancel = async (order: Order) => {
    if (!confirm(`Cancelar o pedido de ${order.product_name}${order.quantity > 1 ? ` × ${order.quantity}` : ''}?`)) return
    setBusy(order.id)
    try {
      const { data, error } = await supabase.rpc('cancel_my_purchase', {
        p_purchase_id: order.id,
        p_cancel_token: order.cancel_token ?? null,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Não foi possível cancelar.')
      toast.success(Number(data.gold_returned) > 0 ? `Pedido cancelado. Recebeste de volta ${data.gold_returned} 🪙.` : 'Pedido cancelado.')
      if (isGuest) removeGuestOrder(order.id)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar.')
    } finally {
      setBusy(null)
    }
  }

  const statusOf = (o: Order) => {
    if (o.status === 'refunded') return { icon: XCircle, label: 'Cancelado', cls: 'bg-red-50 text-red-700' }
    if (o.status === 'delivered') return { icon: CheckCircle2, label: 'Entregue', cls: 'bg-emerald-50 text-emerald-700' }
    if (!o.paid_at) return { icon: Banknote, label: `Por pagar ${formatEur(o.amount_due_eur)}`, cls: 'bg-amber-50 text-amber-700' }
    return { icon: Clock, label: o.is_preorder ? 'Pago · aguarda chegada' : 'Pago · por levantar', cls: 'bg-blue-50 text-blue-700' }
  }

  return (
    <section className="mb-8 rounded-[1.75rem] bg-white p-4 shadow-xl shadow-blue-950/10 ring-1 ring-stone-200 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-950 text-yellow-300">
          <PackageCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-extrabold leading-tight text-blue-950">Os teus pedidos</h2>
          <p className="text-xs text-stone-500">
            {isGuest ? 'Feitos neste dispositivo.' : 'Por pagar ou por levantar.'} Enganaste-te? Podes cancelar até pagares.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {orders.map(order => {
          const status = statusOf(order)
          const Icon = status.icon
          return (
            <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-stone-100 bg-stone-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-gray-900">
                  {order.product_name}
                  {order.quantity > 1 && <span className="ml-1.5 text-blue-700">× {order.quantity}</span>}
                </p>
                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${status.cls}`}>
                  <Icon className="h-3 w-3" /> {status.label}
                </span>
              </div>
              {canSelfCancel(order) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 rounded-full border-red-100 font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleCancel(order)}
                  disabled={busy === order.id}
                >
                  <Undo2 className="h-4 w-4" /> {busy === order.id ? 'A cancelar...' : 'Cancelar'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
