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
      store_products (
        name,
        type,
        image_url
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return <ProfileSettings 
    profile={profile} 
    user={user} 
    userEmail={user.email || ''} 
    purchases={purchases || []}
  />
}
