import Link from 'next/link'
import { ChevronRight, MonitorPlay, Shuffle, Tent, Timer, Wrench } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLS = [
  {
    id: 'sorteio',
    title: 'Sorteador',
    description:
      'Sorteia pessoas de forma divertida: escolhe um evento para usar as presenças, tira dirigentes ou ajudantes num toque e mostra no projetor ou só no telemóvel.',
    icon: Shuffle,
    color: 'from-blue-600 to-indigo-700',
    href: '/admin/ferramentas/sorteio',
    projectorHref: '/admin/ferramentas/sorteio/projetor',
  },
  {
    id: 'cronometro',
    title: 'Cronómetro',
    description:
      'Contagem decrescente, cronómetro, tempos por equipa ou rondas com pausa. Números grandes no projetor, com aviso nos últimos segundos e alarme no fim.',
    icon: Timer,
    color: 'from-orange-500 to-red-600',
    href: '/admin/ferramentas/cronometro',
    projectorHref: '/admin/ferramentas/cronometro/projetor',
  },
  {
    id: 'tendas',
    title: 'Tendas e boleias',
    description:
      'Distribui quem vai a uma saída pelas tendas (rapazes/raparigas, por secção) e pelos carros da ida e da volta. Depois de publicar, cada um vê a sua no Painel.',
    icon: Tent,
    color: 'from-emerald-600 to-teal-700',
    href: '/admin/ferramentas/tendas',
    projectorHref: null,
  },
]

export function ToolsPanel() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-700" /> Ferramentas
          </CardTitle>
          <CardDescription>Utilitários para o dia a dia do clube, fora dos jogos.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {TOOLS.map((tool) => (
          <div key={tool.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <Link href={tool.href} className="group flex items-center gap-4 p-5 transition-colors hover:bg-gray-50">
              <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.color}`}>
                <tool.icon className="h-8 w-8 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-900">{tool.title}</h3>
                <p className="line-clamp-3 text-sm text-gray-500">{tool.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
            </Link>
            {tool.projectorHref && (
              <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
                <Link
                  href={tool.projectorHref}
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
                >
                  <MonitorPlay className="h-4 w-4" /> Ecrã do projetor
                </Link>
                <span className="ml-2 text-xs text-gray-400">abre no computador ligado ao projetor</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
