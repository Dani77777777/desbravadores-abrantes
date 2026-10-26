'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import { getSiteUrl } from '@/utils/site-url'
import {
  buildInviteEmail, createMailer, fromAddress, isDeliverableEmail, isEmailConfigured, unsubscribeToken,
} from '@/lib/email'

/** Máximo de membros por chamada: o cliente envia em lotes para não estourar o tempo da função. */
const MAX_BATCH = 10

export type InviteSkipReason = 'not_allowed' | 'not_in_event' | 'opted_out' | 'no_email' | 'already_invited' | 'send_failed'

export type InviteResult = {
  error?: string
  sent: string[]
  skipped: { userId: string; reason: InviteSkipReason }[]
}

export async function sendEventInvites(input: {
  eventId: string
  memberIds: string[]
  message?: string
  /** Reenviar a quem já foi convidado para este evento. */
  resend?: boolean
}): Promise<InviteResult> {
  const empty: InviteResult = { sent: [], skipped: [] }
  if (!isEmailConfigured()) {
    return { ...empty, error: 'O envio de emails ainda não está configurado (faltam GMAIL_USER e GMAIL_APP_PASSWORD).' }
  }
  const memberIds = [...new Set(input.memberIds)].slice(0, MAX_BATCH)
  const message = (input.message || '').trim().slice(0, 1000)
  if (!memberIds.length) return empty

  // ── Quem convida ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...empty, error: 'A tua sessão expirou. Entra novamente.' }
  const { data: actor } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(actor)
  if (role !== 'coordenador' && role !== 'dirigente') return { ...empty, error: 'Sem permissão para convidar.' }
  const leaderSection = role === 'dirigente' ? effectiveLeadershipSection(actor) || actor?.section : null

  const admin = createServiceClient()

  // ── Evento ──
  const { data: event } = await admin.from('events').select('*').eq('id', input.eventId).maybeSingle()
  if (!event || event.is_finished || new Date(event.end_at || event.start_at).getTime() < Date.now()) {
    return { ...empty, error: 'Este evento já terminou ou não existe.' }
  }
  if (leaderSection && event.target_section && event.target_section !== leaderSection) {
    return { ...empty, error: 'Sem permissão para este evento.' }
  }

  // ── Membros, famílias e quem não quer receber ──
  const [{ data: members }, { data: links }, { data: optOuts }, { data: invites }] = await Promise.all([
    admin.from('profiles').select('id, full_name, section, gender').in('id', memberIds),
    admin.from('family_account_links').select('owner_user_id, associated_user_id').in('associated_user_id', memberIds),
    admin.from('email_opt_outs').select('user_id').in('user_id', memberIds),
    admin.from('event_invites').select('user_id').eq('event_id', event.id).in('user_id', memberIds),
  ])
  const ownerOf = new Map((links || []).map((l) => [l.associated_user_id, l.owner_user_id]))
  const optedOut = new Set((optOuts || []).map((o) => o.user_id))
  const invited = new Set((invites || []).map((i) => i.user_id))

  const result: InviteResult = { sent: [], skipped: [] }
  const skip = (userId: string, reason: InviteSkipReason) => result.skipped.push({ userId, reason })

  const siteUrl = await getSiteUrl()
  const eventUrl = `${siteUrl}/?evento=${event.id}`
  const mailer = createMailer()

  try {
    for (const id of memberIds) {
      const member = members?.find((m) => m.id === id)
      if (!member || (leaderSection && member.section !== leaderSection)) { skip(id, 'not_allowed'); continue }
      if (event.target_section && event.target_section !== member.section) { skip(id, 'not_in_event'); continue }
      if (optedOut.has(id)) { skip(id, 'opted_out'); continue }
      if (invited.has(id) && !input.resend) { skip(id, 'already_invited'); continue }

      // Perfis familiares têm um email interno: o convite vai para a conta principal.
      const ownerId = ownerOf.get(id)
      const { data: authUser } = await admin.auth.admin.getUserById(ownerId || id)
      const email = authUser.user?.email
      if (!isDeliverableEmail(email)) { skip(id, 'no_email'); continue }

      const content = buildInviteEmail({
        firstName: (member.full_name || '').trim().split(/\s+/)[0] || 'Desbravador',
        gender: member.gender,
        toFamily: !!ownerId,
        event,
        message,
        inviterName: actor?.full_name,
        eventUrl,
        unsubscribeUrl: `${siteUrl}/convites/sair?u=${id}&t=${unsubscribeToken(id)}`,
      })
      const oneClickUrl = `${siteUrl}/api/convites/sair?u=${id}&t=${unsubscribeToken(id)}`

      try {
        await mailer.sendMail({
          from: fromAddress(),
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          headers: {
            'List-Unsubscribe': `<${oneClickUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
      } catch (err) {
        console.error('[event-invites] falhou o envio', id, err)
        if ((err as { code?: string })?.code === 'EAUTH') {
          return { ...result, error: 'O Gmail recusou o acesso. Confirma o GMAIL_USER e a palavra-passe de aplicação.' }
        }
        skip(id, 'send_failed')
        continue
      }

      await admin.rpc('record_event_invite', {
        p_event_id: event.id, p_user_id: id, p_invited_by: user.id, p_family: !!ownerId,
      })
      result.sent.push(id)
    }
  } finally {
    mailer.close()
  }

  return result
}
