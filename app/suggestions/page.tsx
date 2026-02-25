import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { MessageSquare } from 'lucide-react'
import { SuggestionsForm } from './SuggestionsForm'
import { redirect } from 'next/navigation'

export default async function SuggestionsPage() {
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

  const { data: suggestions } = await supabase
    .from('suggestions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-black text-gray-900 flex items-center justify-center sm:justify-start gap-3">
            <div className="p-2.5 bg-blue-800 rounded-2xl shadow-lg shadow-blue-100">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            Sugestões e Críticas
          </h1>
          <p className="text-gray-500 mt-3 text-lg font-medium max-w-2xl">
            A tua voz ajuda-nos a construir um clube melhor. Partilha as tuas ideias ou preocupações de forma segura.
          </p>
        </div>

        <SuggestionsForm initialSuggestions={suggestions || []} userId={user.id} />
      </main>
    </div>
  )
}
