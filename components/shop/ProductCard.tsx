'use client'

import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Coins } from 'lucide-react'
import { PurchaseDialog } from './PurchaseDialog'
import { formatEur, maxDiscountEur } from '@/lib/store-economy'

interface ProductCardProps {
  product: any
  userProfile: any | null
  goldRate: number
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos', ticoes: 'Tições', exploradores: 'Exploradores',
  companheiros: 'Companheiros', embaixadores: 'Embaixadores',
}

export function ProductCard({ product, userProfile, goldRate }: ProductCardProps) {
  const isDigital = product.type === 'digital'
  const digitalKeysCount = product.available_keys || 0
  const isOutOfStock = isDigital ? digitalKeysCount <= 0 : product.stock <= 0

  // Níveis continuam a contar: artigos com nível mínimo são exclusivos de membros.
  // Membros registados começam no Nível 1, por isso min_level 1 = "só membros".
  const userLevel = userProfile ? Math.floor((userProfile.total_xp || 0) / 1000) + 1 : 0
  const requiresLevel = product.min_level > 0
  const hasLevel = !requiresLevel || (userProfile !== null && userLevel >= product.min_level)
  const levelReason = !hasLevel
    ? (userProfile ? `Nível ${product.min_level} necessário` : `Só membros Nível ${product.min_level}+`)
    : undefined

  const maxDisc = maxDiscountEur(product)

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

        {requiresLevel && (
          <div className="absolute top-3 left-3 mt-8">
            <Badge className={`font-black text-[10px] uppercase border-none px-3 py-1 ${hasLevel ? 'bg-indigo-600' : 'bg-red-600 animate-pulse'}`}>
              Nível {product.min_level}+
            </Badge>
          </div>
        )}

        {isDigital && digitalKeysCount <= 5 && digitalKeysCount > 0 && (
          <div className="absolute bottom-3 left-3">
             <Badge className="bg-purple-500 text-white font-black text-[9px] border-none">
                Apenas {digitalKeysCount} chaves!
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
        {maxDisc > 0 && (
          <div className="flex items-center gap-1.5 mt-auto">
            <Coins className="w-3.5 h-3.5 text-yellow-600" />
            <span className="text-[11px] font-bold text-yellow-700">
              Até {product.max_discount_percent}% de desconto com Gold (−{formatEur(maxDisc)})
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-5 pt-0 flex items-center justify-between gap-4 border-t border-gray-50 mt-auto">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase text-gray-400">Preço</span>
          <span className="text-xl font-black text-blue-900">
            {formatEur(product.price_eur)}
          </span>
        </div>

        <PurchaseDialog
          product={product}
          userProfile={userProfile}
          goldRate={goldRate}
          disabled={isOutOfStock || !hasLevel}
          reason={levelReason || (isOutOfStock ? 'Esgotado' : undefined)}
        />
      </CardFooter>
    </Card>
  )
}
