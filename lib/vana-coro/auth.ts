// Guarda das actions de gestão do VanaCoro (só coordenação, cargo efetivo).
// As tabelas vanacoro_* não têm políticas para o cliente: depois de confirmar o
// cargo, tudo passa pela service role.

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveRole } from '@/utils/permissions'

export async function requireCoordinator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, helper_role')
    .eq('id', user.id)
    .maybeSingle()
  return effectiveRole(profile) === 'coordenador' ? { user, service: createServiceClient() } : null
}

export type ServiceClient = ReturnType<typeof createServiceClient>

export const FORBIDDEN = { error: 'Só a coordenação pode gerir as perguntas.' }
