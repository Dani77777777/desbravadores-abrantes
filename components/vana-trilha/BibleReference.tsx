import { bibleOnlineUrl } from '@/utils/bible-link'

interface Props {
  reference: string
  className?: string
  children?: React.ReactNode
}

/** Referência bíblica que abre o texto na Bíblia Online num novo separador (texto simples se não for reconhecida). */
export default function BibleReference({ reference, className = '', children }: Props) {
  const url = bibleOnlineUrl(reference)
  const content = children ?? reference
  if (!url) return <span className={className}>{content}</span>

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Ler ${reference} na Bíblia`}
      className={`underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-75 ${className}`}
    >
      {content}
    </a>
  )
}
