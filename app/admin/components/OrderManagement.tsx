'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RotateCcw, Package, User, Clock, Check } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

  const handleDeliver = async (purchaseId: string) => {
    setLoading(purchaseId)
    try {
      const { error } = await supabase
        .from('store_purchases')
        .update({ status: 'delivered', updated_at: new Date().toISOString() })
        .eq('id', purchaseId)
      
      if (error) throw error
      
      toast.success('Artigo marcado como entregue!')
      router.refresh()
    } catch (error: any) {
      toast.error('Erro ao marcar entrega.')
    } finally {
      setLoading(null)
    }
  }

  const handleRefund = async (purchaseId: string) => {
    if (!confirm('Tem a certeza que deseja reembolsar este artigo? O Gold será devolvido ao desbravador.')) return
    
    setLoading(purchaseId)
    try {
      const { error } = await supabase.rpc('refund_purchase', { p_purchase_id: purchaseId })
      
      if (error) throw error
      
      toast.success('Compra reembolsada e Gold devolvido!')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao realizar reembolso.')
    } finally {
      setLoading(null)
    }
  }

  const pendingOrders = initialPurchases.filter(p => p.status === 'pending')
  const completedOrders = initialPurchases.filter(p => p.status !== 'pending')

  return (
    <div className="space-y-6">
      {/* Pending Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4" /> Encomendas Pendentes ({pendingOrders.length})
        </h3>
        
        {pendingOrders.length === 0 ? (
          <div className="text-center py-8 border rounded-xl bg-gray-50/50">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-20" />
            <p className="text-gray-400 text-sm">Não há encomendas pendentes.</p>
          </div>
        ) : (
          pendingOrders.map(order => (
            <Card key={order.id} className="border-orange-100 bg-orange-50/10">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar className="h-10 w-10 border-2 border-orange-100 shadow-sm">
                      <AvatarFallback className="bg-orange-100 text-orange-700 font-bold uppercase">
                        {order.profiles?.full_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-900 truncate">{order.profiles?.full_name}</h4>
                      <p className="text-xs text-gray-500 font-medium">
                        {SECTION_LABELS[order.profiles?.section] || order.profiles?.section} • {new Date(order.created_at).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex-1 px-4 py-2 bg-white/50 rounded-lg border border-orange-100/50">
                    <p className="text-[10px] font-black uppercase text-orange-600 mb-0.5">Artigo Solicitado</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800">{order.store_products?.name}</span>
                      <span className="font-black text-blue-900 bg-blue-50 px-2 py-0.5 rounded text-xs">{order.store_products?.price} 🪙</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700 gap-2 h-9"
                      onClick={() => handleDeliver(order.id)}
                      disabled={loading === order.id}
                    >
                      <Check className="w-4 h-4" /> Entregar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 border-red-100 hover:bg-red-50 gap-2 h-9"
                      onClick={() => handleRefund(order.id)}
                      disabled={loading === order.id}
                    >
                      <RotateCcw className="w-4 h-4" /> Reembolsar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* History Section */}
      {completedOrders.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Histórico Recente
          </h3>
          <div className="space-y-2">
            {completedOrders.slice(0, 5).map(order => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-white border rounded-lg text-sm transition-opacity hover:opacity-100 opacity-80">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${order.status === 'delivered' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <span className="font-bold text-gray-700">{order.profiles?.full_name}</span>
                    <span className="mx-2 text-gray-300">•</span>
                    <span className="text-gray-500">{order.store_products?.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className={`text-[10px] font-black ${order.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                    {order.status === 'delivered' ? 'ENTREGUE' : 'REEMBOLSADO'}
                  </Badge>
                  {order.status === 'delivered' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] text-gray-400 hover:text-red-600 hover:bg-red-50 font-bold"
                      onClick={() => handleRefund(order.id)}
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
