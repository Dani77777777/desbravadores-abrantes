'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Key, Clock, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface PurchaseHistoryProps {
  purchases: any[]
}

export function PurchaseHistory({ purchases }: PurchaseHistoryProps) {
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

  const toggleKey = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (purchases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            Histórico de Compras
          </CardTitle>
          <CardDescription>Ainda não realizaste compras na loja.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-indigo-600" />
          Histórico de Compras
        </CardTitle>
        <CardDescription>Consulta as tuas encomendas e chaves digitais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {purchases.map((purchase) => {
          const product = purchase.store_products
          const isDigital = product?.type === 'digital'
          const status = purchase.status
          const date = new Date(purchase.created_at).toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          })

          return (
            <div key={purchase.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-gray-100 bg-stone-50/50 gap-4 transition-all hover:border-indigo-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center border border-gray-100 overflow-hidden shadow-sm">
                   {product?.image_url ? (
                     <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                   ) : (
                     <ShoppingBag className="w-6 h-6 text-gray-300" />
                   )}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{product?.name || 'Produto Removido'}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                    <Clock className="w-3 h-3" />
                    {date}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                {isDigital ? (
                  <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                       <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none font-bold text-[10px] uppercase">Digital</Badge>
                       <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-2 text-xs border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 px-3 transition-colors"
                        onClick={() => toggleKey(purchase.id)}
                       >
                         {visibleKeys[purchase.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                         {visibleKeys[purchase.id] ? 'Ocultar Chave' : 'Ver Chave'}
                       </Button>
                    </div>
                    {visibleKeys[purchase.id] && (
                      <div className="mt-1 p-2 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-top-1 duration-200">
                        <Key className="w-3 h-3 text-indigo-600" />
                        <code className="text-xs font-black text-indigo-900 break-all font-mono">
                          {purchase.digital_key_delivered || 'Chave não encontrada'}
                        </code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none font-bold text-[10px] uppercase">Físico</Badge>
                    {status === 'delivered' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none flex gap-1 font-bold text-[10px] uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Entregue
                      </Badge>
                    ) : status === 'refunded' ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none flex gap-1 font-bold text-[10px] uppercase">
                        <XCircle className="w-3 h-3" /> Reembolsado
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none flex gap-1 font-bold text-[10px] uppercase animate-pulse">
                        <Clock className="w-3 h-3" /> Por entregar
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
