import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ScrollbarBackdrop } from '@/components/layout/ScrollbarBackdrop'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Clube de Desbravadores - Abrantes',
  description: 'Plataforma de gamificação do Clube de Desbravadores de Abrantes',
  manifest: '/manifest.json',
  icons: {
    icon: '/images/perfil.jpg',
    apple: '/images/perfil.jpg',
    shortcut: '/images/perfil.jpg',
  },
  verification: {
    google: 'SZS_Lo-vdaAFESv_G192-3wDUL5nAM3lQGeTp90EChE',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt">
      <body className={inter.className}>
        {children}
        <Toaster />
        <ScrollbarBackdrop />
      </body>
    </html>
  )
}
