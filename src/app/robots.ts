import type { MetadataRoute } from 'next'

/**
 * Sem este arquivo o /robots.txt caía na página 404 em HTML — e robots
 * inválido atrapalha o Google a indexar a loja. O painel e as APIs ficam
 * de fora do índice; o cardápio, dentro.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/'],
    },
  }
}
