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
    /**
     * A identidade do app para o navegador. Fixa e separada do start_url: se um
     * dia a página inicial mudar de endereço, o celular continua entendendo que
     * é o MESMO app — sem isso, o cliente acabaria com dois ícones iguais na
     * tela de início.
     */
    id: '/',
    name: 'Churrascaria Brasa Viva',
    short_name: 'Brasa Viva',
    description: 'O Tradicional Churrasco Baiano. Peça pelo celular, pague e retire.',
    start_url: '/',
    // o app inteiro; sem isto, sair para o /admin abriria fora da janela do app
    scope: '/',
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
    /**
     * Com as fotos, o Android troca a linha seca de "instalar app" por um
     * cartão com prévia — o mesmo tratamento que um app de loja recebe.
     * Elas saem de `node scripts/tirar-foto-instalacao.mjs`; as medidas
     * declaradas aqui têm que bater com o arquivo, senão o navegador ignora.
     */
    screenshots: [
      {
        src: '/tela-celular.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
      },
      {
        src: '/tela-computador.png',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
      },
    ],
    shortcuts: [
      { name: 'Meus pedidos', url: '/meus-pedidos' },
      { name: 'Cardápio', url: '/' },
    ],
  }
}
