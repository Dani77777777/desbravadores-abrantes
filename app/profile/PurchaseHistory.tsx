'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Key, Clock, CheckCircle2, XCircle, Eye, EyeOff, Banknote, Coins, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { canSelfCancel, formatEur } from '@/lib/store-economy'

interface PurchaseHistoryProps {
  purchases: any[]
}

export function PurchaseHistory({ purchases }: PurchaseHistoryProps) {
  const supabase = createClient()
  const router = useRouter()
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [cancelling, setCancelling] = useState<string | null>(null)

  // Engano? O próprio cancela enquanto não pagou: devolve o Gold e apaga o registo.
  const handleCancel = async (purchase: any) => {
    if (!confirm(`Cancelar o pedido de ${purchase.store_products?.name || 'este artigo'}?`)) return
    setCancelling(purchase.id)
    try {
      const { data, error } = await supabase.rpc('cancel_my_purchase', { p_purchase_id: purchase.id })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Não foi possível cancelar.')
      toast.success(Number(data.gold_returned) > 0 ? `Pedido cancelado. Recebeste de volta ${data.gold_returned} 🪙.` : 'Pedido cancelado.')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar.')
    } finally {
      setCancelling(null)
    }
  }

  const toggleKey = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (purchases.length === 0) {
    return (
      <Card className="gap-0 rounded-[1.75rem] border-none py-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:py-7">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-extrabold text-blue-950">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-500 text-white shadow-md"><ShoppingBag className="w-5 h-5" /></span>
            Histórico de Compras
          </CardTitle>
          <CardDescription>Ainda não realizaste compras na loja.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="gap-0 rounded-[1.75rem] border-none py-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:py-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl font-extrabold text-blue-950">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-500 text-white shadow-md"><ShoppingBag className="w-5 h-5" /></span>
          Histórico de Compras
        </CardTitle>
        <CardDescription>Consulta as tuas encomendas, pagamentos e chaves digitais.</CardDescription>
      </CardHeader>
      <CardContent className="mt-6 space-y-3">
        {purchases.map((purchase) => {
          const product = purchase.store_products
          const isDigital = product?.type === 'digital'
          const status = purchase.status
          const isPaid = !!purchase.paid_at
          const amountDue = Number(purchase.amount_due_eur) || 0
          const discount = Number(purchase.discount_eur) || 0
          const canSeeKey = isDigital && isPaid && status !== 'refunded'
          const date = new Date(purchase.created_at).toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          })

          return (
            <div key={purchase.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-stone-100 bg-stone-50 gap-4 transition-all hover:border-indigo-200 hover:bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center border border-gray-100 overflow-hidden shadow-sm shrink-0">
                   {product?.image_url ? (
                     <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                   ) : (
                     <ShoppingBag className="w-6 h-6 text-gray-300" />
                   )}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">
                    {product?.name || 'Produto Removido'}
                    {(purchase.quantity || 1) > 1 && <span className="ml-1.5 text-indigo-600">× {purchase.quantity}</span>}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {date}</span>
                    <span className="font-bold text-gray-700">{formatEur(amountDue)}</span>
                    {Number(purchase.volume_discount_eur) > 0 && (
                      <span className="text-emerald-700 font-bold">
                        −{formatEur(Number(purchase.volume_discount_eur))} qtd. ({Number(purchase.volume_discount_percent)}%)
                      </span>
                    )}
                    {discount > 0 && (
                      <span className="flex items-center gap-0.5 text-yellow-700 font-bold">
                        <Coins className="w-3 h-3" /> −{formatEur(discount)} ({purchase.gold_spent} 🪙)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <Badge className={`border-none font-bold text-[10px] uppercase ${isDigital ? 'bg-purple-100 text-purple-700 hover:bg-purple-100' : 'bg-blue-100 text-blue-700 hover:bg-blue-100'}`}>
                  {isDigital ? 'Digital' : 'Físico'}
                </Badge>
                {product?.is_preorder && (
                  <Badge className="border-none font-bold text-[10px] uppercase bg-teal-100 text-teal-700 hover:bg-teal-100">
                    Reserva
                  </Badge>
                )}

                {status === 'refunded' ? (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none flex gap-1 font-bold text-[10px] uppercase">
                    <XCircle className="w-3 h-3" /> Reembolsado
                  </Badge>
                ) : !isPaid ? (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none flex gap-1 font-bold text-[10px] uppercase animate-pulse">
                    <Banknote className="w-3 h-3" /> Por pagar {formatEur(amountDue)}
                  </Badge>
                ) : status === 'delivered' ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none flex gap-1 font-bold text-[10px] uppercase">
                    <CheckCircle2 className="w-3 h-3" /> Entregue
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none flex gap-1 font-bold text-[10px] uppercase">
                    <Clock className="w-3 h-3" /> {product?.is_preorder ? 'Pago · aguarda chegada' : 'Pago · por levantar'}
                  </Badge>
                )}

                {canSeeKey && (
                  <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2 text-xs border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 px-3 transition-colors"
                      onClick={() => toggleKey(purchase.id)}
                    >
                      {visibleKeys[purchase.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {visibleKeys[purchase.id] ? 'Ocultar Chave' : 'Ver Chave'}
                    </Button>
                    {visibleKeys[purchase.id] && (
                      <div className="mt-1 p-2 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-top-1 duration-200">
                        <Key className="w-3 h-3 text-indigo-600" />
                        <code className="text-xs font-black text-indigo-900 break-all font-mono">
                          {purchase.digital_key_delivered || 'Chave não encontrada'}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {canSelfCancel(purchase) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 px-3"
                    onClick={() => handleCancel(purchase)}
                    disabled={cancelling === purchase.id}
                  >
                    <Undo2 className="w-3 h-3" /> {cancelling === purchase.id ? 'A cancelar...' : 'Cancelar'}
                  </Button>
                )}

                {isDigital && !isPaid && status !== 'refunded' && (
                  <span className="text-[10px] font-bold text-gray-400 w-full sm:w-auto text-right">
                    A chave fica disponível após o pagamento.
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
