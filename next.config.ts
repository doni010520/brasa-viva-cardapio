import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // gera o servidor mínimo em .next/standalone — é o que a imagem Docker roda
  output: 'standalone',

  images: {
    remotePatterns: [
      // fotos dos pratos servidas pelo Storage do Supabase
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },

  poweredByHeader: false,

  // Imagens e ícones do public/ mudam raramente; sem isso o navegador
  // re-baixa ~100 KB por visita. 30 dias equilibra: longo para o dia a dia,
  // curto o bastante para uma troca de foto aparecer sem chorar cache.
  async headers() {
    return [
      /**
       * O service worker é a única peça que NÃO pode ser guardada em cache.
       * Se o navegador segurasse uma versão velha dele, o aparelho ficaria
       * preso a ela — inclusive deixando de receber os avisos de pedido.
       */
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:all*(webp|png|jpg|jpeg|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400',
          },
        ],
      },
    ]
  },
}

export default nextConfig
