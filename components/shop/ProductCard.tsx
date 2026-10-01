'use client'

import { Package, Coins, BadgePercent } from 'lucide-react'
import { PurchaseDialog } from './PurchaseDialog'
import { formatEur, isPreorderOpen, formatDeadline } from '@/lib/store-economy'
import { computePurchasePricing, volumeTiersLabel } from '@/lib/store-pricing'
import { displayFont } from '@/components/landing/fonts'

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
  // Por encomenda: sem stock — só fecha quando passa o prazo das reservas.
  const isPreorder = !isDigital && !!product.is_preorder
  const preorderClosed = isPreorder && !isPreorderOpen(product)
  const isOutOfStock = isDigital ? digitalKeysCount <= 0 : !isPreorder && product.stock <= 0

  // Níveis continuam a contar: artigos com nível mínimo são exclusivos de membros.
  // Membros registados começam no Nível 1, por isso min_level 1 = "só membros".
  const userLevel = userProfile ? Math.floor((userProfile.total_xp || 0) / 1000) + 1 : 0
  const requiresLevel = product.min_level > 0
  const hasLevel = !requiresLevel || (userProfile !== null && userLevel >= product.min_level)
  const levelReason = !hasLevel
    ? (userProfile ? `Nível ${product.min_level} necessário` : `Só membros Nível ${product.min_level}+`)
    : undefined

  // Teto do Gold para 1 unidade — com custo definido, nunca abaixo do custo.
  const unitPricing = computePurchasePricing(product, 1, null, goldRate)
  const maxDisc = unitPricing.goldCapEur
  // Só artigos físicos com custo definido (e escalões que o stock permite).
  const volumeLabel = volumeTiersLabel(product)

  return (
    <div className="group flex flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-md shadow-blue-950/5 ring-1 ring-stone-200 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-blue-950/15">
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-yellow-50">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-24 w-24 -rotate-6 items-center justify-center rounded-3xl bg-white text-blue-300 shadow-lg transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
              <Package className="h-12 w-12" />
            </div>
          </div>
        )}

        {/* Tipo + nível */}
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md ${isDigital ? 'bg-purple-600' : 'bg-blue-600'}`}>
            {isDigital ? 'Digital' : 'Físico'}
          </span>
          {isPreorder && (
            <span className="rounded-full bg-teal-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
              Por encomenda
            </span>
          )}
          {requiresLevel && (
            <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md ${hasLevel ? 'bg-indigo-600' : 'animate-pulse bg-red-600'}`}>
              Nível {product.min_level}+
            </span>
          )}
        </div>

        {/* Section Restrictions */}
        {product.restrictions && product.restrictions.length > 0 && (
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
            {product.restrictions.map((section: string) => (
              <span key={section} className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-stone-700 shadow-sm backdrop-blur-sm">
                {SECTION_LABELS[section] || section}
              </span>
            ))}
          </div>
        )}

        {!isDigital && !isPreorder && product.stock <= 5 && product.stock > 0 && (
          <span className="absolute bottom-3 left-3 -rotate-2 rounded-lg bg-orange-500 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md">
            🔥 Apenas {product.stock} restantes!
          </span>
        )}

        {isDigital && digitalKeysCount <= 5 && digitalKeysCount > 0 && (
          <span className="absolute bottom-3 left-3 -rotate-2 rounded-lg bg-purple-500 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md">
            ⚡ Apenas {digitalKeysCount} chaves!
          </span>
        )}

        {isPreorder && !preorderClosed && product.preorder_deadline && (
          <span className="absolute bottom-3 left-3 -rotate-2 rounded-lg bg-teal-600 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md">
            📅 Reservas até {formatDeadline(product.preorder_deadline)}
          </span>
        )}

        {preorderClosed && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-950/50 backdrop-blur-[2px]">
            <span className="-rotate-6 rounded-xl bg-teal-700 px-6 py-2 text-sm font-extrabold tracking-wider text-white shadow-xl">
              RESERVAS FECHADAS
            </span>
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-950/50 backdrop-blur-[2px]">
            <span className="-rotate-6 rounded-xl bg-red-600 px-6 py-2 text-sm font-extrabold tracking-wider text-white shadow-xl">
              ESGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className={`${displayFont.className} line-clamp-1 text-lg font-extrabold leading-tight text-blue-950`}>
          {product.name}
        </h3>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-stone-500">
          {product.description || 'Sem descrição disponível.'}
        </p>
        {(maxDisc > 0 || volumeLabel) && (
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            {maxDisc > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1">
                <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-[11px] font-bold text-amber-800">
                  {unitPricing.goldLimitedByCost
                    ? <>Até −{formatEur(maxDisc)} com Gold</>
                    : <>Até {product.max_discount_percent}% com Gold (−{formatEur(maxDisc)})</>}
                </span>
              </div>
            )}
            {volumeLabel && (
              <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-emerald-100">
                <BadgePercent className="h-3 w-3 shrink-0 text-emerald-600" />
                <span className="text-[10px] font-bold text-emerald-800">{volumeLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-stone-100 p-5 pt-4">
        <div className="flex shrink-0 flex-col">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">Preço</span>
          <span className={`${displayFont.className} text-2xl font-extrabold leading-none text-blue-950`}>
            {formatEur(product.price_eur)}
          </span>
        </div>

        <PurchaseDialog
          product={product}
          userProfile={userProfile}
          goldRate={goldRate}
          disabled={isOutOfStock || preorderClosed || !hasLevel}
          reason={levelReason || (isOutOfStock ? 'Esgotado' : preorderClosed ? 'Reservas fechadas' : undefined)}
        />
      </div>
    </div>
  )
}
