'use client'

import { useState } from 'react'
import { ProductCard } from './ProductCard'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ProductGridProps {
  products: any[]
  userProfile: any | null
  goldRate: number
}

export function ProductGrid({ products, userProfile, goldRate }: ProductGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'physical' | 'digital'>('all')

  const filteredProducts = products.filter(product => {
    // 1. Search filter
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    // 2. Section restrictions filter (convidados não pertencem a nenhuma secção)
    const isRestricted = product.restrictions && product.restrictions.length > 0
    const canSee = !isRestricted || (userProfile && (product.restrictions.includes(userProfile.section) || userProfile.role === 'coordenador'))

    if (!canSee) return false

    // 3. Category filter
    if (filter === 'mine' && isRestricted && !product.restrictions.includes(userProfile?.section)) return false
    if (filter === 'physical' && product.type !== 'physical') return false
    if (filter === 'digital' && product.type !== 'digital') return false

    return true
  })

  // Count relevant for user
  const relevantProducts = products.filter(p => !p.restrictions || p.restrictions.length === 0 || (userProfile && p.restrictions.includes(userProfile.section))).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className={`cursor-pointer px-4 py-1.5 rounded-full ${filter === 'all' ? 'bg-blue-900' : 'text-gray-500'}`}
            onClick={() => setFilter('all')}
          >
            Todos ({products.length})
          </Badge>
          {userProfile && (
            <Badge
              variant={filter === 'mine' ? 'default' : 'outline'}
              className={`cursor-pointer px-4 py-1.5 rounded-full ${filter === 'mine' ? 'bg-blue-900 border-none' : 'text-gray-500'}`}
              onClick={() => setFilter('mine')}
            >
              Para a minha Classe ({relevantProducts})
            </Badge>
          )}
          <Badge
            variant={filter === 'physical' ? 'default' : 'outline'}
            className={`cursor-pointer px-4 py-1.5 rounded-full ${filter === 'physical' ? 'bg-blue-900 border-none' : 'text-gray-500'}`}
            onClick={() => setFilter('physical')}
          >
            Físicos
          </Badge>
          <Badge
            variant={filter === 'digital' ? 'default' : 'outline'}
            className={`cursor-pointer px-4 py-1.5 rounded-full ${filter === 'digital' ? 'bg-blue-900 border-none' : 'text-gray-500'}`}
            onClick={() => setFilter('digital')}
          >
            Digitais
          </Badge>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Procurar artigos..."
            className="pl-9 bg-white border-gray-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
          <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium text-lg">Nenhum produto encontrado.</p>
          <p className="text-gray-400 text-sm">Tenta ajustar os filtros ou pesquisar outra coisa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              userProfile={userProfile}
              goldRate={goldRate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
