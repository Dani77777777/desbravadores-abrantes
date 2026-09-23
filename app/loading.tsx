import { PageLoader } from '@/components/layout/PageLoader'

// Aparece logo ao navegar, enquanto o servidor prepara a página (o painel faz várias consultas).
export default function Loading() {
  return <PageLoader />
}
