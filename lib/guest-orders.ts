// Encomendas de convidados guardadas neste dispositivo: o token de cancelamento
// é o único "login" de quem compra sem conta. Tudo em try/catch (modo privado,
// armazenamento bloqueado).

const KEY = 'shop:guest-orders'

export interface GuestOrderRef {
  id: string
  token: string
}

export function readGuestOrders(): GuestOrderRef[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(o => o && o.id && o.token) : []
  } catch {
    return []
  }
}

export function writeGuestOrders(orders: GuestOrderRef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders.slice(0, 20)))
  } catch {}
}

export function addGuestOrder(order: GuestOrderRef) {
  writeGuestOrders([order, ...readGuestOrders().filter(o => o.id !== order.id)])
  window.dispatchEvent(new Event(KEY))
}

export function removeGuestOrder(id: string) {
  writeGuestOrders(readGuestOrders().filter(o => o.id !== id))
  window.dispatchEvent(new Event(KEY))
}

export const GUEST_ORDERS_EVENT = KEY
