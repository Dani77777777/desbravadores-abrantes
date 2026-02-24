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
    } = announcement

    console.log(`[send-push] Processing announcement: "${title}"`, {
      target_user_id,
      target_section,
      target_role,
    })

    // Build query to find the right subscribers
    let query = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')

    if (target_user_id) {
      // Personal announcement – only for this user
      query = query.eq('user_id', target_user_id)
    } else if (target_section || target_role) {
      // Find user IDs matching the target criteria
      let profileQuery = supabase
        .from('profiles')
        .select('id')

      if (target_section) profileQuery = profileQuery.eq('section', target_section)
      if (target_role) profileQuery = profileQuery.eq('role', target_role)

      const { data: profiles, error: profileError } = await profileQuery
      if (profileError) throw profileError

      const userIds = (profiles || []).map((p: { id: string }) => p.id)
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0, reason: 'no matching users' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      query = query.in('user_id', userIds)
    }
    // If no target is set → send to everyone (global announcement)

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
