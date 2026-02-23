import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, MapPin, Mail, Instagram, ExternalLink } from 'lucide-react'

export default async function ContactsPage() {
  const supabase = await createClient()
  
  // Try to get current user/profile for navigation consistency
  const { data: { user } } = await supabase.auth.getUser()
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  const whatsappLink = "https://chat.whatsapp.com/IfZxTuAswraCibvmg6PApu"
  const instagramLink = "https://www.instagram.com/desbravadores.abrantes/"
  const address = "Av. Defensores de Chaves 23, Abrantes"
  const simpleMapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      {/* Hero Section */}
      <section className="bg-blue-900 text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">Contactos</h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto font-medium">
            Estamos prontos para te receber. Escolhe a forma mais fácil de falares connosco!
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 pb-20 space-y-16">
        {/* Contact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* WhatsApp Card */}
          <Card className="border-none shadow-xl bg-white overflow-hidden group hover:shadow-2xl transition-all duration-300">
            <div className="h-2 bg-emerald-500 w-full" />
            <CardContent className="p-8 space-y-6 flex flex-col h-full">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <MessageCircle className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-stone-900 mb-2">WhatsApp</h3>
                <p className="text-stone-600 leading-relaxed">
                  Junta-te ao nosso grupo de interessados e recebe todas as novidades.
                </p>
              </div>
              <a 
                href={whatsappLink} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 rounded-xl shadow-md border-none">
                  Entrar no Grupo <ExternalLink className="ml-2 w-4 h-4" />
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Instagram Card */}
          <Card className="border-none shadow-xl bg-white overflow-hidden group hover:shadow-2xl transition-all duration-300">
            <div className="h-2 bg-pink-500 w-full" />
            <CardContent className="p-8 space-y-6 flex flex-col h-full">
              <div className="w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center text-pink-600 group-hover:scale-110 transition-transform">
                <Instagram className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-stone-900 mb-2">Instagram</h3>
                <p className="text-stone-600 leading-relaxed">
                  Segue as nossas aventuras diárias e vê as fotos do clube.
                </p>
              </div>
              <a 
                href={instagramLink} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full border-pink-200 text-pink-600 hover:bg-pink-50 font-bold py-6 rounded-xl">
                  @desbravadores.abrantes
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Email Card */}
          <Card className="border-none shadow-xl bg-white overflow-hidden group hover:shadow-2xl transition-all duration-300">
            <div className="h-2 bg-blue-500 w-full" />
            <CardContent className="p-8 space-y-6 flex flex-col h-full">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                <Mail className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-stone-900 mb-2">Email</h3>
                <p className="text-stone-600 leading-relaxed">
                  Para questões administrativas ou parcerias institucionais.
                </p>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl text-center">
                <p className="text-sm font-bold text-blue-900 break-all select-all">
                  direcao.desbravadores.abrantes@gmail.com
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map Section */}
        <section className="space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-3xl font-black text-blue-900 tracking-tight">Onde nos encontrar</h2>
              <div className="flex items-center justify-center md:justify-start gap-2 text-stone-600">
                <MapPin className="w-5 h-5 text-red-500" />
                <span className="font-medium text-lg">{address}</span>
              </div>
            </div>
            <a 
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button size="lg" className="bg-blue-900 hover:bg-blue-800 text-white rounded-full px-8 py-6 font-bold text-lg shadow-lg">
                Como chegar <MapPin className="ml-2 w-5 h-5" />
              </Button>
            </a>
          </div>
          
          <div className="w-full h-[500px] bg-white rounded-3xl overflow-hidden shadow-2xl border-8 border-white">
            <iframe
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={simpleMapsUrl}
            ></iframe>
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-900 to-blue-950 rounded-[2.5rem] p-12 md:p-20 text-center space-y-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }} />
          <div className="relative z-10 space-y-6">
            <h2 className="text-4xl md:text-5xl font-black text-white px-4 leading-tight">Ainda tens perguntas?</h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
              Não hesites em contactar-nos. Ficaremos muito felizes em responder a quaisquer dúvidas sobre inscrições ou sobre o que significa ser um Desbravador.
            </p>
            <div className="pt-4">
               <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 font-black px-8 py-3 rounded-full text-lg shadow-lg">
                 Sempre prontos para servir!
               </div>
            </div>
          </div>
        </section>

        <footer className="text-center pt-10">
           <p className="text-xs text-stone-400 font-bold uppercase tracking-[0.3em]">
             Clube de Desbravadores de Abrantes • {new Date().getFullYear()}
           </p>
        </footer>
      </main>
    </div>
  )
}
