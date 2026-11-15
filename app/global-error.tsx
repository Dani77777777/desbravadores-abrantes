'use client'

import { useEffect } from 'react'

/**
 * Última rede de segurança do site todo: apanha erros no layout raiz, que
 * nenhum error.tsx consegue apanhar. Substitui o layout raiz, por isso tem o
 * seu próprio <html> e <body> e usa estilos inline (não depende do CSS do site).
 *
 * Não mexe no localStorage: recarregar volta a pôr a pessoa onde estava.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error] erro não recuperado', error)
  }, [error])

  return (
    <html lang="pt" translate="no">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: 'linear-gradient(135deg, #0f172a, #1e3a8a 55%, #312e81)',
          color: '#fff',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Algo correu mal</p>
        <p style={{ fontSize: 14, opacity: 0.75, margin: '8px 0 0', maxWidth: 320 }}>
          Recarrega a página para continuar. Não perdes o teu lugar.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 28,
            padding: '12px 28px',
            border: 0,
            borderRadius: 999,
            background: '#0ea5e9',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  )
}
