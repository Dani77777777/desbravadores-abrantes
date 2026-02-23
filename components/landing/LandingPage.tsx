'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Trophy, Users, Star, ArrowRight, Shield, Heart, Medal, Tent } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <Navbar user={null} profile={null} />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden bg-gradient-to-b from-blue-50 to-stone-50">
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231e3a8a' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-extrabold text-blue-950 tracking-tight leading-tight">
              Uma Aventura Que <span className="text-blue-700">Transforma</span> Vidas
            </h1>
            <p className="text-xl text-stone-600 leading-relaxed">
              Explora a natureza, faz amigos para a vida e descobre o teu potencial. No Clube de Desbravadores, cada passo é uma nova descoberta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="bg-blue-700 hover:bg-blue-800 text-white px-8 py-7 text-lg rounded-full shadow-lg hover:scale-105 transition-transform font-bold">
                  Começa a Tua Jornada <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <button 
                onClick={() => document.getElementById('welcome')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-blue-800 font-semibold hover:underline cursor-pointer"
              >
                Saber mais sobre o clube
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Welcome/Discovery Section */}
      <section id="welcome" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-blue-900 uppercase tracking-wider text-sm">O que são os Desbravadores?</h2>
              <h3 className="text-4xl font-bold text-stone-900 leading-tight">Um movimento mundial de jovens em busca de propósito.</h3>
              <p className="text-lg text-stone-600 leading-relaxed">
                Os Desbravadores são rapazes e raparigas com idades variadas, de diferentes classes sociais, cor, ou religião. Reunimo-nos semanalmente para aprender novas habilidades, ajudar a comunidade e fortalecer o nosso caráter.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 bg-emerald-100 rounded-lg text-emerald-700">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900">Valores Fortes</h4>
                    <p className="text-sm text-stone-500">Honra, amizade e serviço ao próximo.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 bg-blue-100 rounded-lg text-blue-700">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900">Comunidade</h4>
                    <p className="text-sm text-stone-500">Um lugar onde todos pertencem.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square bg-blue-50 rounded-3xl overflow-hidden shadow-2xl rotate-3 border-8 border-white">
                 <img 
                   src="/images/desbravadores.png" 
                   alt="Clube de Desbravadores" 
                   className="w-full h-full object-cover"
                 />
              </div>
              <Card className="absolute -bottom-8 -left-8 w-64 border-none shadow-xl bg-white/90 backdrop-blur-sm p-6 transform -rotate-3">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-yellow-900 font-bold">100+</div>
                  <div className="font-bold text-stone-800">Especialidades para Aprender</div>
                </div>
                <p className="text-xs text-stone-500">Desde Primeiros Socorros até Astronomia.</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Abrantes Specific Section */}
      <section className="py-20 bg-blue-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-blue-800 -skew-x-12 transform translate-x-1/2" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <Badge className="bg-yellow-400 text-yellow-950 hover:bg-yellow-500 mb-6 px-4 py-1 text-sm font-bold border-none">O NOSSO CLUBE</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">Clube de Desbravadores de Abrantes</h2>
            <p className="text-xl text-blue-100 leading-relaxed mb-10 italic">
              "Aqui em Abrantes, não somos apenas um clube, somos uma família que cresce junta no coração de Portugal."
            </p>
            <div className="space-y-6 text-blue-50 text-lg">
              <p>
                O nosso clube nasceu do desejo de proporcionar aos jovens da região um ambiente seguro e estimulante para o seu desenvolvimento físico, mental e espiritual. 
              </p>
              <p>
                As nossas reuniões são cheias de energia, onde treinamos para campismos, aprendemos sobre a natureza do Ribatejo e preparamo-nos para ser cidadãos exemplares e servos de Deus.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Gamification Explanation */}
      <section className="py-20 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-stone-900 mb-6">Porquê este Site de Gamificação?</h2>
            <p className="text-lg text-stone-600 leading-relaxed">
              Queremos que a tua progressão no clube seja tão emocionante como um jogo. Criámos esta plataforma para tornar os teus feitos visíveis e recompensar o teu esforço.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-8 bg-white rounded-2xl shadow-sm border border-stone-200 space-y-4 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto">
                <Trophy className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Ganha XP</h3>
              <p className="text-stone-600">Completa tarefas, participa em eventos e sobe de nível à medida que aprendes novas competências.</p>
            </div>
            <div className="p-8 bg-white rounded-2xl shadow-sm border border-stone-200 space-y-4 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center text-yellow-700 mx-auto">
                <Star className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Acumula Gold</h3>
              <p className="text-stone-600">A tua dedicação é recompensada com moedas que poderás usar no futuro para bónus exclusivos do clube.</p>
            </div>
            <div className="p-8 bg-white rounded-2xl shadow-sm border border-stone-200 space-y-4 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-700 mx-auto">
                <Heart className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Serviço e Fé</h3>
              <p className="text-stone-600">O sistema também destaca a tua participação em projetos sociais e o teu crescimento espiritual.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-blue-900 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Pronto para a tua próxima aventura?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/login?mode=signup">
              <Button size="lg" className="bg-white text-blue-900 hover:bg-yellow-400 hover:text-blue-900 px-10 py-8 text-xl rounded-full shadow-xl font-bold border-none">
                Criar Conta Agora
              </Button>
            </Link>
            <div className="text-blue-100">
              ou <Link href="/login?mode=login" className="text-white font-bold underline ml-2 hover:text-yellow-400 transition-colors">fazer login</Link>
            </div>
          </div>
          <p className="text-blue-200">Junta-te a nós e faz parte da história do Clube de Desbravadores de Abrantes.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-stone-900 text-stone-400 border-t border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border border-yellow-400 shrink-0">
                <Shield className="w-4 h-4 text-white" />
             </div>
             <span className="font-bold text-white">Desbravadores Abrantes</span>
          </div>
          <div className="flex gap-8 text-sm">
            <Link href="/contacts" className="hover:text-white transition-colors">Contactos</Link>
          </div>
          <div className="text-xs">
            © {new Date().getFullYear()} Clube de Desbravadores de Abrantes. Aventura • Amizade • Fé
          </div>
        </div>
      </footer>
    </div>
  )
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
            {children}
        </span>
    )
}
