
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { redeemCode, claimManualReward } from '@/lib/actions/qr'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Coins, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { AutoClaimHandler } from '@/components/dashboard/AutoClaimHandler'
import { ManualClaimForm } from '@/components/dashboard/ManualClaimForm'

export default async function CodePage({ params }: { params: { code: string } }) {
  const supabase = await createClient()
  const { code } = await params

  // 1. Verificar autenticação
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // 2. Procurar o código (apenas os dados, não processar resgate ainda)
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (qrError || !qrCode) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Navbar user={user} profile={profile} />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
           <div className="bg-white p-8 rounded-2xl border border-red-100 shadow-sm space-y-4">
             <div className="mx-auto w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
               <AlertTriangle className="w-8 h-8" />
             </div>
             <h1 className="text-xl font-bold">Código Inválido</h1>
             <p className="text-gray-500">Não conseguimos encontrar o código "{code.toUpperCase()}".</p>
             <Button asChild variant="outline" className="mt-4">
               <Link href="/">Voltar ao Início</Link>
             </Button>
           </div>
        </main>
      </div>
    )
  }

  // 3. Verificar se já resgatou
  const { data: existingScan } = await supabase
    .from('qr_scans')
    .select('*')
    .eq('qr_code_id', qrCode.id)
    .eq('user_id', user.id)
    .single()

  const alreadyRedeemed = !!existingScan

  // 4. Verificar limite global
  let limitReached = false
  let currentUses = 0
  if (qrCode.max_uses_global !== null) {
    const { count } = await supabase
      .from('qr_scans')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCode.id)
    
    currentUses = count || 0
    // Só mostramos como limite atingido se o usuário AINDA NÃO resgatou
    limitReached = !alreadyRedeemed && currentUses >= qrCode.max_uses_global
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      
      <main className="max-w-2xl mx-auto px-4 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
        </Link>

        <div className="space-y-6">
          <Card className="border-none shadow-md overflow-hidden">
            <div className="h-2 bg-blue-600 w-full" />
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  Código: {code.toUpperCase()}
                </Badge>
              </div>
              <CardTitle className="text-2xl font-bold mt-4">{qrCode.title}</CardTitle>
            </CardHeader>

              <CardContent className="space-y-8 pb-8">
                {/* Mode: Auto Claim */}
                {qrCode.auto_claim ? (
                  <AutoClaimHandler code={code} />
                ) : (
                  /* Mode: Manual Claim with Content */
                  <div className="space-y-8">
                    {qrCode.content && (
                      <div className="prose prose-blue max-w-none bg-blue-50/30 border border-blue-50 rounded-2xl p-6 italic text-blue-900/80 leading-relaxed whitespace-pre-wrap">
                        {qrCode.content}
                      </div>
                    )}

                     {!alreadyRedeemed ? (
                       <div className="space-y-4">
                          {limitReached ? (
                            <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
                              <p className="text-red-600 font-medium flex items-center justify-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Este código já atingiu o limite de utilizações ({qrCode.max_uses_global}).
                              </p>
                            </div>
                          ) : (
                            <ManualClaimForm 
                              qrCodeId={qrCode.id}
                              xpReward={qrCode.xp_reward}
                              goldReward={qrCode.gold_reward}
                              maxUses={qrCode.max_uses_global}
                              currentUses={currentUses}
                            />
                          )}
                       </div>
                     ) : (
                      <div className="text-center p-6 bg-slate-50 rounded-xl">
                        <p className="text-slate-500 font-medium flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          Já reclamaste esta recompensa!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
      </main>
    </div>
  )
}
