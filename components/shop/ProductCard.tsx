'use client'

import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Coins, Eye } from 'lucide-react'
import { PurchaseDialog } from './PurchaseDialog'

interface ProductCardProps {
  product: any
  userProfile: any
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos', ticoes: 'Tições', exploradores: 'Exploradores',
  companheiros: 'Companheiros', embaixadores: 'Embaixadores',
}

export function ProductCard({ product, userProfile }: ProductCardProps) {
  const isDigital = product.type === 'digital'
  const isOutOfStock = !isDigital && product.stock <= 0
  const canAfford = userProfile.current_gold >= product.price

  return (
    <Card className="group overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col bg-white rounded-3xl">
      <div className="aspect-square relative overflow-hidden bg-gray-50 border-b border-gray-100/50">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200">
            <Package className="w-16 h-16" />
          </div>
        )}
        
        {/* Type Badge */}
        <div className="absolute top-3 left-3">
          <Badge className={`font-black text-[10px] uppercase border-none px-3 py-1 ${isDigital ? 'bg-purple-600' : 'bg-blue-600'}`}>
            {isDigital ? 'Digital' : 'Físico'}
          </Badge>
        </div>

        {/* Section Restrictions */}
        {product.restrictions && product.restrictions.length > 0 && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
            {product.restrictions.map((section: string) => (
              <Badge key={section} variant="secondary" className="bg-white/90 backdrop-blur-sm text-[9px] font-bold text-gray-600 border-none">
                {SECTION_LABELS[section] || section}
              </Badge>
            ))}
          </div>
        )}

        {!isDigital && product.stock <= 5 && product.stock > 0 && (
          <div className="absolute bottom-3 left-3">
             <Badge className="bg-orange-500 text-white font-black text-[9px] border-none">
                Apenas {product.stock} restantes!
             </Badge>
          </div>
        )}
        
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
            <Badge className="bg-red-600 text-white font-black px-6 py-2 text-sm border-none shadow-xl">
              ESGOTADO
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-5 flex-1 flex flex-col gap-2">
        <h3 className="font-bold text-gray-900 leading-tight group-hover:text-blue-900 transition-colors line-clamp-1">
          {product.name}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-2 min-h-[2rem]">
          {product.description || 'Sem descrição disponível.'}
        </p>
      </CardContent>

      <CardFooter className="p-5 pt-0 flex items-center justify-between gap-4 border-t border-gray-50 mt-auto">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase text-gray-400">Preço</span>
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-yellow-600" />
            <span className={`text-xl font-black ${canAfford ? 'text-blue-900' : 'text-red-600'}`}>
              {product.price}
            </span>
          </div>
        </div>

        <PurchaseDialog 
          product={product} 
          userProfile={userProfile} 
          disabled={isOutOfStock || !canAfford}
          reason={!canAfford ? 'Gold insuficiente' : isOutOfStock ? 'Esgotado' : undefined}
        />
      </CardFooter>
    </Card>
  )
}
