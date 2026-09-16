import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import * as webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Import Supabase admin client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Configure web-push VAPID keys
    webpush.setVapidDetails(
      'mailto:' + (Deno.env.get('VAPID_EMAIL') || 'admin@desbravadoresabrantes.pt'),
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    // This function is called by a Supabase trigger via pg_net, receiving the new announcement
    const body = await req.json()
    const announcement = body.record || body

    const {
      id,
      title,
      message,
      target_user_id,
      target_section,
      target_role,
      audience,
    } = announcement

    console.log(`[send-push] Processing announcement: "${title}"`, {
      target_user_id,
      target_section,
      target_role,
      audience,
    })

    const noRecipients = () =>
      new Response(JSON.stringify({ sent: 0, reason: 'no matching users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    // Build query to find the right subscribers
    let query = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')

    const isGlobal = !target_user_id && !target_section && !target_role && audience !== 'members'

    if (!isGlobal) {
      // Os destinatários são gravados na BD no momento do envio (announcement_recipients),
      // com a mesma regra usada pelo Painel — é a fonte de verdade.
      const { data: recipients, error: recipientsError } = await supabase
        .from('announcement_recipients')
        .select('user_id')
        .eq('announcement_id', id)
      if (recipientsError) throw recipientsError

      const userIds = (recipients || []).map((r: { user_id: string }) => r.user_id)
      if (userIds.length === 0) return noRecipients()

      query = query.in('user_id', userIds)
    }
    // Global → todos os subscritores (exceto o autor)
    else if (announcement.author_id) {
      query = query.neq('user_id', announcement.author_id)
    }

    const { data: subscriptions, error: subError } = await query
    if (subError) throw subError

    console.log(`[send-push] Found ${subscriptions?.length || 0} subscriptions`)

    const payload = JSON.stringify({
      title,
      message,
      url: '/', // Redirect to the main dashboard (where announcements are shown)
    })

    let sent = 0
    const staleEndpoints: string[] = []

    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        )
        sent++
      } catch (err: unknown) {
        // 410 Gone = subscription expired/invalid, remove it
        if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error(`[send-push] Failed to send to ${sub.endpoint}:`, err)
        }
      }
    }

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints)
      console.log(`[send-push] Cleaned up ${staleEndpoints.length} stale subscriptions`)
    }

    return new Response(JSON.stringify({ sent, stale: staleEndpoints.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-push] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
