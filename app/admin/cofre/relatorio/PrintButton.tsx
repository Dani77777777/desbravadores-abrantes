'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-950 px-3 text-sm font-bold text-white hover:bg-blue-900"
    >
      <Printer className="h-4 w-4" /> Imprimir
    </button>
  )
}
