import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * O Next monta os <link> do ícone sozinho a partir de src/app/icon.png e
 * src/app/apple-icon.png — não precisa declarar nada aqui.
 */
export const metadata: Metadata = {
  title: {
    default: 'Churrascaria Brasa Viva — Cardápio',
    template: '%s · Brasa Viva',
  },
  description:
    'O Tradicional Churrasco Baiano. Almoço livre, no quilo e marmitex. ' +
    'Peça pelo celular, pague e retire — ou receba em casa.',
  applicationName: 'Brasa Viva',
  openGraph: {
    title: 'Churrascaria Brasa Viva',
    description: 'O Tradicional Churrasco Baiano. Peça pelo celular.',
    images: ['/fachada.webp'],
    type: 'website',
    locale: 'pt_BR',
  },
  // cardápio de restaurante não tem por que aparecer em busca com página
  // de pedido de cliente; o robots cuida do essencial
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0d0b0a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
