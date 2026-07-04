'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RotateCcw, Clock, Check, Banknote, Key, UserX, Coins } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatEur } from '@/lib/store-economy'

interface OrderManagementProps {
  initialPurchases: any[]
  profile: any
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos', ticoes: 'Tições', exploradores: 'Exploradores',
  companheiros: 'Companheiros', embaixadores: 'Embaixadores',
}

export function OrderManagement({ initialPurchases, profile }: OrderManagementProps) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const runAction = async (purchaseId: string, action: () => PromiseLike<{ error: any }>, successMsg: string) => {
    setLoading(purchaseId)
    try {
      const { error } = await action()
      if (error) throw error
      toast.success(successMsg)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar a encomenda.')
    } finally {
      setLoading(null)
    }
  }

  const handleMarkPaid = (purchaseId: string, deliver: boolean) =>
    runAction(
      purchaseId,
      () => supabase.rpc('mark_purchase_paid', { p_purchase_id: purchaseId, p_deliver: deliver }),
      deliver ? 'Pagamento e entrega confirmados!' : 'Pagamento confirmado!'
    )

  const handleDeliver = (purchaseId: string) =>
    runAction(
      purchaseId,
      () => supabase.rpc('mark_purchase_delivered', { p_purchase_id: purchaseId }),
      'Artigo marcado como entregue!'
    )

  const handleRefund = (purchaseId: string, isPaid: boolean) => {
    const msg = isPaid
      ? 'Reembolsar esta compra? O Gold do desconto será devolvido e o stock reposto. O dinheiro tens de o devolver em mãos.'
      : 'Cancelar este pedido? O Gold do desconto será devolvido e o stock reposto.'
    if (!confirm(msg)) return
    runAction(
      purchaseId,
      () => supabase.rpc('refund_purchase', { p_purchase_id: purchaseId }),
      isPaid ? 'Compra reembolsada!' : 'Pedido cancelado!'
    )
  }

  const awaitingPayment = initialPurchases.filter(p => p.status === 'pending' && !p.paid_at)
  const awaitingDelivery = initialPurchases.filter(p => p.status === 'pending' && p.paid_at)
  const completedOrders = initialPurchases.filter(p => p.status !== 'pending')

  const buyerName = (order: any) => order.profiles?.full_name || order.buyer_name || 'Desconhecido'

  const OrderCard = ({ order, tone }: { order: any; tone: 'orange' | 'blue' }) => {
    const isGuest = !order.user_id
    const isPaid = !!order.paid_at
    const isDigital = order.store_products?.type === 'digital'
    const busy = loading === order.id

    return (
      <Card className={tone === 'orange' ? 'border-orange-100 bg-orange-50/10' : 'border-blue-100 bg-blue-50/10'}>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className={`h-10 w-10 border-2 shadow-sm shrink-0 ${tone === 'orange' ? 'border-orange-100' : 'border-blue-100'}`}>
                <AvatarFallback className={`font-bold uppercase ${tone === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {buyerName(order).charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-gray-900 truncate">{buyerName(order)}</h4>
                  {isGuest && (
                    <Badge variant="outline" className="text-[9px] font-black uppercase text-gray-500 border-gray-200 gap-1">
                      <UserX className="w-3 h-3" /> Convidado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-medium">
                  {isGuest
                    ? 'Compra sem conta'
                    : SECTION_LABELS[order.profiles?.section] || order.profiles?.section}
                  {' • '}{new Date(order.created_at).toLocaleDateString('pt-PT')}
                </p>
              </div>
            </div>

            <div className={`flex-1 px-4 py-2 rounded-lg border bg-white/60 ${tone === 'orange' ? 'border-orange-100/50' : 'border-blue-100/50'}`}>
              <p className={`text-[10px] font-black uppercase mb-0.5 ${tone === 'orange' ? 'text-orange-600' : 'text-blue-600'}`}>
                {isPaid ? 'Pago — por entregar' : 'Aguarda pagamento'}
              </p>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-gray-800">{order.store_products?.name}</span>
                <div className="flex items-center gap-2 text-xs">
                  {Number(order.discount_eur) > 0 && (
                    <span className="font-bold text-yellow-700 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> −{formatEur(Number(order.discount_eur))} ({order.gold_spent} 🪙)
                    </span>
                  )}
                  <span className="font-black text-green-800 bg-green-50 px-2 py-0.5 rounded flex items-center gap-1">
                    <Banknote className="w-3 h-3" /> {formatEur(Number(order.amount_due_eur))}
                  </span>
                </div>
              </div>
              {isDigital && isPaid && order.digital_key_delivered && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-purple-700 font-mono font-bold">
                  <Key className="w-3 h-3 shrink-0" />
                  <span className="break-all">{order.digital_key_delivered}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {!isPaid ? (
                <>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 gap-1.5 h-9"
                    onClick={() => handleMarkPaid(order.id, false)}
                    disabled={busy}
                  >
                    <Banknote className="w-4 h-4" /> Pago
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-800 hover:bg-blue-900 gap-1.5 h-9"
                    onClick={() => handleMarkPaid(order.id, true)}
                    disabled={busy}
                  >
                    <Check className="w-4 h-4" /> Pago + Entregue
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5 h-9"
                  onClick={() => handleDeliver(order.id)}
                  disabled={busy}
                >
                  <Check className="w-4 h-4" /> Entregar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-100 hover:bg-red-50 gap-1.5 h-9"
                onClick={() => handleRefund(order.id, isPaid)}
                disabled={busy}
              >
                <RotateCcw className="w-4 h-4" /> {isPaid ? 'Reembolsar' : 'Cancelar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Awaiting payment */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Banknote className="w-4 h-4" /> Por Pagar ({awaitingPayment.length})
        </h3>

        {awaitingPayment.length === 0 ? (
          <div className="text-center py-8 border rounded-xl bg-gray-50/50">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-20" />
            <p className="text-gray-400 text-sm">Não há pagamentos pendentes.</p>
          </div>
        ) : (
          awaitingPayment.map(order => <OrderCard key={order.id} order={order} tone="orange" />)
        )}
      </div>

      {/* Paid, awaiting delivery */}
      {awaitingDelivery.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" /> Pagas — Por Entregar ({awaitingDelivery.length})
          </h3>
          {awaitingDelivery.map(order => <OrderCard key={order.id} order={order} tone="blue" />)}
        </div>
      )}

      {/* History Section */}
      {completedOrders.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Histórico Recente
          </h3>
          <div className="space-y-2">
            {completedOrders.slice(0, 8).map(order => (
              <div key={order.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border rounded-lg text-sm transition-opacity hover:opacity-100 opacity-80">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${order.status === 'delivered' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-bold text-gray-700">{buyerName(order)}</span>
                      {!order.user_id && <span className="ml-1 text-[9px] font-black text-gray-400 uppercase">(convidado)</span>}
                      <span className="mx-2 text-gray-300">•</span>
                      <span className="text-gray-500">{order.store_products?.name}</span>
                    </div>
                    {order.store_products?.type === 'digital' && order.status === 'delivered' && order.digital_key_delivered && (
                      <div className="flex items-center gap-1 text-[10px] text-purple-600 font-mono font-bold">
                        <Key className="w-3 h-3 shrink-0" />
                        <span className="break-all">{order.digital_key_delivered}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-gray-500">{formatEur(Number(order.amount_due_eur))}</span>
                  <Badge variant="outline" className={`text-[10px] font-black ${order.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                    {order.status === 'delivered' ? 'ENTREGUE' : 'REEMBOLSADO'}
                  </Badge>
                  {order.status === 'delivered' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-gray-400 hover:text-red-600 hover:bg-red-50 font-bold"
                      onClick={() => handleRefund(order.id, true)}
                      disabled={loading === order.id}
                    >
                      Reembolsar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
