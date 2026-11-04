import { createServiceClient } from '@/utils/supabase/service'
import { withPriceQuotes } from '@/lib/store-pricing'

// Loja: tarefas que só o servidor faz (service role). Só importar em código de
// servidor (páginas/server actions). Ver supabase-migration-store-security-fix.sql.

/**
 * Encomendas físicas por pagar há mais de store_settings.unpaid_expiry_days dias
 * caducam: o Gold volta, o stock é reposto e o registo é apagado. Se o projeto
 * tiver pg_cron isto também corre todas as noites; chamar ao abrir a Loja e o
 * /admin garante que o stock está certo mesmo sem pg_cron.
 */
export async function expireUnpaidStoreOrders() {
  try {
    const { error } = await createServiceClient().rpc('expire_unpaid_store_orders')
    if (error) console.warn('expire_unpaid_store_orders:', error.message)
  } catch (error) {
    console.warn('expire_unpaid_store_orders:', error)
  }
}

/**
 * Junta aos artigos as cotações por quantidade (desconto por quantidade e teto do
 * Gold), calculadas aqui com o custo, que o browser não pode ler. Os artigos
 * saem sem cost_price.
 */
export async function attachPriceQuotes<T extends { id: string; type?: string }>(products: T[]) {
  const costs = new Map<string, number | null>()
  if (products.length) {
    try {
      const { data, error } = await createServiceClient()
        .from('store_products')
        .select('id, cost_price')
        .in('id', products.map((p) => p.id))
      if (error) throw error
      for (const row of data || []) costs.set(row.id, row.cost_price)
    } catch (error) {
      // Sem custo, o diálogo mostra só o teto em % (o servidor valida na compra).
      console.warn('store cost_price:', error)
    }
  }
  return products.map((p) => withPriceQuotes({ ...p, cost_price: costs.get(p.id) ?? null }))
}
