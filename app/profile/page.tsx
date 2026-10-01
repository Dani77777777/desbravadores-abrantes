import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileSettings from './ProfileSettings'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  const { data: purchases } = await supabase
    .from('store_purchases')
    .select(`
      id,
      product_id,
      status,
      digital_key_delivered,
      created_at,
      price_eur,
      discount_eur,
      volume_discount_percent,
      volume_discount_eur,
      amount_due_eur,
      quantity,
      gold_spent,
      paid_at,
      delivered_at,
      store_products (
        name,
        type,
        image_url,
        is_preorder
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Insígnia "Peregrino da Promessa" (VanaTrilha): 7 estações completadas.
  const { data: trilhaProgress } = await supabase
    .from('vanatrilha_station_progress')
    .select('station')
    .eq('user_id', user.id)

  return <ProfileSettings 
    profile={profile} 
    user={user} 
    userEmail={user.email || ''} 
    purchases={purchases || []}
    vanaTrilhaStations={new Set((trilhaProgress || []).map((r) => r.station)).size}
  />
}
