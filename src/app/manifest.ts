import type { MetadataRoute } from 'next'

/**
 * Faz o site poder ser instalado na tela de início do celular.
 *
 * Não é firula: no iPhone, o Safari apaga cookie e storage de um site que a
 * pessoa não abre há uns dias. Quando o site está instalado na tela de início,
 * ele ganha armazenamento próprio e o cliente continua logado. É o mais perto
 * de "app do iFood" que dá para chegar sem publicar em loja de aplicativo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Churrascaria Brasa Viva',
    short_name: 'Brasa Viva',
    description: 'O Tradicional Churrasco Baiano. Peça pelo celular, pague e retire.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0b0a',
    theme_color: '#0d0b0a',
    lang: 'pt-BR',
    categories: ['food', 'shopping'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
      // o Android recorta o ícone em círculo; este tem margem para aguentar
      { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Meus pedidos', url: '/meus-pedidos' },
      { name: 'Cardápio', url: '/' },
    ],
  }
}
