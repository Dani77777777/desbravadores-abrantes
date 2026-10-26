// Envio de emails pelo Gmail do clube (SMTP com palavra-passe de aplicação).
// Só se importa no servidor (server actions / route handlers).
//
// Variáveis de ambiente:
//   GMAIL_USER          → endereço do Gmail do clube
//   GMAIL_APP_PASSWORD  → palavra-passe de aplicação (16 letras) da conta Google
//
// O Gmail aceita cerca de 500 destinatários por dia numa conta normal.

import crypto from 'crypto'
import nodemailer from 'nodemailer'

const CLUB_NAME = 'Desbravadores de Abrantes'

export function isEmailConfigured() {
  return !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD
}

/** Emails internos dos perfis familiares (domínio .invalid) não recebem nada. */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.toLowerCase().endsWith('.invalid')
}

export function createMailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 1,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') },
  })
}

export function fromAddress() {
  return { name: CLUB_NAME, address: process.env.GMAIL_USER! }
}

// ── Deixar de receber ────────────────────────────────────────
// O link leva o id do membro assinado com HMAC, para funcionar sem sessão iniciada.
// A chave é a service role (já é segredo do servidor); se for rodada, os links
// antigos deixam de funcionar, o que é aceitável.

function unsubscribeKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function unsubscribeToken(userId: string) {
  return crypto.createHmac('sha256', unsubscribeKey()).update(`invites:${userId}`).digest('base64url').slice(0, 32)
}

export function isValidUnsubscribeToken(userId: string, token: string) {
  if (!unsubscribeKey() || !/^[0-9a-f-]{36}$/i.test(userId)) return false
  const expected = Buffer.from(unsubscribeToken(userId))
  const given = Buffer.from(token)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

// ── Modelo do convite ───────────────────────────────────────

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function lisbon(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', ...opts })
}

export type InviteEvent = {
  title: string
  description?: string | null
  location?: string | null
  is_online?: boolean | null
  start_at: string
  end_at?: string | null
  rsvp_enabled?: boolean | null
  rsvp_deadline?: string | null
}

export type InviteContent = {
  /** Primeiro nome do membro convidado. */
  firstName: string
  gender?: string | null
  /** O email vai para a conta principal da família (pai, mãe…). */
  toFamily: boolean
  event: InviteEvent
  /** Mensagem opcional de quem convida. */
  message?: string
  inviterName?: string | null
  eventUrl: string
  unsubscribeUrl: string
}

export function buildInviteEmail(c: InviteContent) {
  const e = c.event
  const date = lisbon(e.start_at, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = lisbon(e.start_at, { hour: '2-digit', minute: '2-digit' })
  const endTime = e.end_at ? lisbon(e.end_at, { hour: '2-digit', minute: '2-digit' }) : null
  const endDate = e.end_at ? lisbon(e.end_at, { weekday: 'long', day: 'numeric', month: 'long' }) : null
  // Eventos de vários dias (acampamentos) mostram também o dia do fim.
  const when = !endTime ? `${date}, ${time}`
    : endDate === date ? `${date}, ${time}–${endTime}`
    : `${date}, ${time} até ${endDate}, ${endTime}`
  const where = e.is_online ? 'Online (o link está no Painel do site)' : e.location?.trim() || null
  const deadline = e.rsvp_enabled && e.rsvp_deadline
    ? lisbon(e.rsvp_deadline, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  const g = (m: string, f: string, both: string) => (c.gender === 'm' ? m : c.gender === 'f' ? f : both)
  const greeting = c.toFamily
    ? `Olá! ${g('O', 'A', 'O/A')} ${c.firstName} está ${g('convidado', 'convidada', 'convidado/a')}`
    : `Olá, ${c.firstName}! Estás ${g('convidado', 'convidada', 'convidado/a')}`
  const intro = `${greeting} para o próximo evento dos ${CLUB_NAME}.`
  const cta = e.rsvp_enabled ? 'Confirmar presença' : 'Ver o evento'
  const subject = `Convite: ${e.title}`

  const text = [
    intro,
    '',
    e.title,
    `Quando: ${when}`,
    where ? `Onde: ${where}` : null,
    e.description?.trim() ? `\n${e.description.trim()}` : null,
    c.message?.trim() ? `\n${c.message.trim()}${c.inviterName ? `\n— ${c.inviterName}` : ''}` : null,
    deadline ? `\nConfirma a presença até ${deadline}.` : null,
    `\n${cta}: ${c.eventUrl}`,
    `\nNão queres receber estes convites? ${c.unsubscribeUrl}`,
  ].filter((l) => l !== null).join('\n')

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#78716c;font-size:13px;vertical-align:top">${label}</td><td style="padding:4px 0;color:#172554;font-size:15px;font-weight:600">${esc(value)}</td></tr>`

  const html = `<!doctype html>
<html lang="pt-PT"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:#172554;padding:20px 24px;color:#facc15;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${CLUB_NAME}</td></tr>
  <tr><td style="padding:24px">
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.5">${esc(intro)}</p>
    <h1 style="margin:0 0 12px;color:#172554;font-size:24px;line-height:1.2">${esc(e.title)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0">${row('Quando', when)}${where ? row('Onde', where) : ''}</table>
    ${e.description?.trim() ? `<p style="margin:16px 0 0;color:#44403c;font-size:14px;line-height:1.5;white-space:pre-line">${esc(e.description.trim())}</p>` : ''}
    ${c.message?.trim() ? `<div style="margin:20px 0 0;padding:14px 16px;background:#fefce8;border-radius:12px;color:#44403c;font-size:14px;line-height:1.5;white-space:pre-line">${esc(c.message.trim())}${c.inviterName ? `<br><span style="color:#78716c">— ${esc(c.inviterName)}</span>` : ''}</div>` : ''}
    ${deadline ? `<p style="margin:20px 0 0;color:#a16207;font-size:14px;font-weight:700">Confirma a presença até ${esc(deadline)}.</p>` : ''}
    <p style="margin:24px 0 0"><a href="${esc(c.eventUrl)}" style="display:inline-block;background:#facc15;color:#172554;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:12px">${cta}</a></p>
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e7e5e4;color:#a8a29e;font-size:12px;line-height:1.5">
    Recebeste este email porque ${c.toFamily ? `geres a conta ${g('do', 'da', 'do/a')} ${esc(c.firstName)}` : 'tens conta'} no site dos ${CLUB_NAME}.
    <a href="${esc(c.unsubscribeUrl)}" style="color:#78716c">Não quero receber estes convites</a>.
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject, text, html }
}
