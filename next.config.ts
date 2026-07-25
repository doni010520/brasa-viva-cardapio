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
}

export default nextConfig
