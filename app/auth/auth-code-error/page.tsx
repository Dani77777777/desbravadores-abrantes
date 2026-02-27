'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowLeft, RefreshCcw } from 'lucide-react'
import Link from 'next/link'

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 p-4">
      {/* Decorative overlay pattern */}
      <div className="absolute inset-0 z-0 opacity-10" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <Card className="w-full max-w-md z-10 bg-white/95 backdrop-blur-sm shadow-2xl border-none overflow-hidden">
        <div className="h-2 bg-red-500" />
        <CardHeader className="text-center pt-8">
          <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-blue-900">Erro na Verificação</CardTitle>
          <CardDescription className="text-blue-800 text-base">
            Não foi possível validar o teu link de confirmação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-8">
          <div className="bg-blue-50/50 rounded-lg p-4 space-y-3 border border-blue-100">
            <h3 className="font-semibold text-blue-900 text-sm">Razões comuns:</h3>
            <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
              <li>O link já foi utilizado uma vez.</li>
              <li>O link expirou (geralmente dura 24h).</li>
              <li>Estás a usar um navegador diferente do que usaste para te inscrever.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full bg-blue-800 hover:bg-blue-900 text-white font-medium">
              <Link href="/login" className="flex items-center justify-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                Tentar Novamente
              </Link>
            </Button>
            
            <Button asChild variant="ghost" className="w-full text-blue-700 hover:text-blue-900 hover:bg-blue-50">
              <Link href="/" className="flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Voltar à Página Inicial
              </Link>
            </Button>
          </div>

          <p className="text-[10px] text-center text-gray-400 italic">
            Clube de Desbravadores - Abrantes
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
