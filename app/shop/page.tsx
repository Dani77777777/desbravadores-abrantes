import type { CSSProperties } from 'react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { ShoppingBag, Coins, Trophy, Sparkles, ArrowRight, MousePointerClick, Banknote, Star } from 'lucide-react'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { MyOrders } from '@/components/shop/MyOrders'
import { STORE_PRODUCT_COLUMNS, type GoldRateInfo } from '@/lib/store-economy'
import { attachPriceQuotes, expireUnpaidStoreOrders } from '@/lib/store-maintenance'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'

const D = displayFont.className

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

export default async function ShopPage() {
  const supabase = await createClient()

  // Encomendas por pagar há demasiado tempo caducam antes de se mostrar o stock.
  const [
    {
      data: { user },
    },
  ] = await Promise.all([supabase.auth.getUser(), expireUnpaidStoreOrders()])

  // A loja é pública: visitantes podem comprar (pagam em dinheiro, sem desconto Gold).
  let profile = null
  let myOrders: any[] | null = null
  if (user) {
    const [{ data }, { data: pending }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      // Pedidos em aberto do membro (para poder cancelar um engano aqui mesmo).
      supabase
        .from('store_purchases')
        .select('id, status, paid_at, created_at, quantity, amount_due_eur, store_products:product_id(name, is_preorder)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
    profile = data
    myOrders = pending || []
  }

  const [{ data: products }, { data: keyStock }, { data: rateData }] = await Promise.all([
    // Sem cost_price: os preços por quantidade vêm já calculados (attachPriceQuotes).
    supabase
      .from('store_products')
      .select(STORE_PRODUCT_COLUMNS)
      .eq('is_active', true)
      .order('price_eur', { ascending: true }),
    supabase.from('digital_key_stock').select('*'),
    supabase.rpc('get_gold_rate_info'),
  ])

  const rateInfo = (rateData || null) as GoldRateInfo | null
  const goldRate = rateInfo?.gold_per_euro || 100

  const stockByProduct: Record<string, number> = {}
  for (const row of keyStock || []) stockByProduct[row.product_id] = row.available

  const productsWithKeys = (await attachPriceQuotes(products || [])).map(p => ({
    ...p,
    available_keys: stockByProduct[p.id] ?? 0,
  }))

  const steps = [
    { icon: MousePointerClick, title: 'Escolhe', text: 'o artigo que queres' },
    { icon: Coins, title: 'Usa Gold', text: profile ? 'para baixar o preço' : 'se fores membro' },
    { icon: Banknote, title: 'Paga', text: 'o resto em dinheiro no clube' },
  ]

  return (
    <div className="min-h-screen overflow-x-clip bg-stone-50">
      <Navbar user={user} profile={profile} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-950 pb-32 pt-14 text-white md:pb-36 md:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(45% 60% at 85% 30%, rgba(250,204,21,.25), transparent 70%), radial-gradient(45% 60% at 10% 80%, rgba(139,92,246,.3), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />
        <Coins aria-hidden className="lp-float absolute right-[8%] top-10 hidden h-16 w-16 rotate-12 text-yellow-400/25 lg:block" />
        <Star aria-hidden className="lp-spin absolute -left-8 bottom-10 hidden h-24 w-24 fill-red-500/20 text-red-500/20 md:block" />

        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="text-center lg:text-left">
            <div
              className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300 backdrop-blur"
              style={delay(0)}
            >
              <ShoppingBag className="h-3.5 w-3.5" /> Loja dos Desbravadores
            </div>
            <h1
              className={`${D} lp-rise mt-5 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl`}
              style={delay(100)}
            >
              A loja do{' '}
              <span className="lp-shimmer bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
                clube.
              </span>
            </h1>
            <p className="lp-rise mx-auto mt-5 max-w-xl text-lg text-blue-100/80 lg:mx-0" style={delay(200)}>
              Aberta a todos! Se és membro registado, usa o teu Gold para
              ter descontos.
            </p>

            <ol className="lp-rise mt-8 flex flex-wrap justify-center gap-2.5 lg:justify-start" style={delay(300)}>
              {steps.map(({ icon: Icon, title, text }, i) => (
                <li
                  key={title}
                  className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] py-2 pl-2 pr-4 ring-1 ring-inset ring-white/10"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-400 text-blue-950">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-left text-sm leading-tight">
                    <span className="font-extrabold text-white">{i + 1}. {title}</span>
                    <span className="block text-xs text-blue-100/70">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {profile ? (
            <div className="lp-rise grid grid-cols-2 gap-3" style={delay(250)}>
              <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-indigo-500 to-violet-700 p-5 shadow-xl shadow-indigo-950/40">
                <Trophy aria-hidden className="absolute -bottom-4 -right-4 h-24 w-24 text-white/10" />
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <Trophy className="h-5 w-5 text-yellow-300" />
                </div>
                <p className="mt-4 text-[11px] font-extrabold uppercase tracking-wider text-indigo-100">O teu nível</p>
                <p className={`${D} text-5xl font-extrabold leading-none`}>
                  {Math.floor((profile.total_xp || 0) / 1000) + 1}
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[1.75rem] bg-yellow-400 p-5 text-blue-950 shadow-xl shadow-yellow-900/30">
                <Coins aria-hidden className="absolute -bottom-4 -right-4 h-24 w-24 text-amber-600/20" />
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-950/10">
                  <Coins className="h-5 w-5 text-amber-700" />
                </div>
                <p className="mt-4 text-[11px] font-extrabold uppercase tracking-wider text-blue-950/70">O teu Gold</p>
                <p className={`${D} text-5xl font-extrabold leading-none`}>{profile.current_gold}</p>
              </div>
              <p className="col-span-2 rounded-2xl bg-white/[0.07] px-4 py-2.5 text-center text-sm font-semibold text-blue-100 ring-1 ring-inset ring-white/10">
                1 € de desconto ≈ <span className="font-extrabold text-yellow-300">{goldRate} Gold</span>
              </p>
            </div>
          ) : (
            <Link
              href="/login?mode=signup"
              className="lp-rise group relative mx-auto block w-full max-w-md overflow-hidden rounded-[1.75rem] bg-yellow-400 p-7 text-blue-950 shadow-[0_20px_50px_-15px_rgba(250,204,21,.6)] transition-transform hover:-translate-y-1 hover:-rotate-1"
              style={delay(250)}
            >
              <Sparkles aria-hidden className="absolute -right-6 -top-6 h-28 w-28 text-white/30" />
              <span className="inline-flex -rotate-2 rounded-lg bg-blue-950 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-yellow-300">
                És desbravador?
              </span>
              <p className={`${D} mt-4 text-3xl font-extrabold leading-tight`}>
                Regista-te e poupa com o teu Gold!
              </p>
              <p className="mt-2 text-blue-950/75">
                Usa o Gold para ter descontos e desbloqueia artigos por nível.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 font-extrabold">
                Criar conta <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          )}
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-20 max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <MyOrders memberOrders={myOrders} />
        <ProductGrid
          products={productsWithKeys}
          userProfile={profile}
          goldRate={goldRate}
        />
      </main>

      <SiteFooter />
    </div>
  )
}
