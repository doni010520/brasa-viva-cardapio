import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * O Next monta os <link> do ícone sozinho a partir de src/app/icon.png e
 * src/app/apple-icon.png — não precisa declarar nada aqui.
 */
export const metadata: Metadata = {
  /**
   * Sem isto, o Next monta og:image relativo — e WhatsApp, Instagram e Google
   * precisam de URL absoluta para buscar a imagem da prévia.
   */
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL_BASE ?? 'http://localhost:3000'),
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
    // JPEG de propósito: a prévia do WhatsApp não renderiza WebP. Medidas
    // declaradas porque alguns leitores não baixam a imagem só para medir.
    images: [
      {
        url: '/og.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: 'Churrascaria Brasa Viva — o Tradicional Churrasco Baiano',
      },
    ],
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Churrascaria Brasa Viva',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Churrascaria Brasa Viva',
    description: 'O Tradicional Churrasco Baiano. Peça pelo celular.',
    images: ['/og.jpg'],
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
