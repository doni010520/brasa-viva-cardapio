/**
 * Service worker do cardápio.
 *
 * Faz duas coisas, nesta ordem de importância:
 *   1. recebe os avisos de status do pedido (push) e mostra na tela do celular;
 *   2. deixa o app abrir rápido e dizer algo honesto quando o sinal cai.
 *
 * O que ele NÃO faz, de propósito: guardar HTML de cardápio, carrinho, pedido
 * ou qualquer coisa de /admin e /api. Em restaurante, cache de página vira
 * cliente pedindo prato que acabou e vendo preço velho — pior do que não ter
 * cache nenhum. Só entra aqui o que não estraga: arquivo de build (que já vem
 * com nome único a cada versão) e imagem.
 *
 * Este arquivo é servido com no-store (ver next.config.ts): o navegador confere
 * se há versão nova a cada visita, então trocar o VERSAO abaixo basta para
 * limpar o cache de todo mundo.
 */

const VERSAO = 'v1'
const PREFIXO = 'brasa-viva-'
const CACHE_ESTATICO = `${PREFIXO}estatico-${VERSAO}`
const CACHE_IMAGENS = `${PREFIXO}imagens-${VERSAO}`

const PAGINA_SEM_SINAL = '/offline.html'

/** Guardado já na instalação: quando o sinal cai não dá para buscar nada. */
const ESSENCIAIS = [PAGINA_SEM_SINAL, '/icone-192.png']

/**
 * Teto do cache de imagem. Sem isso, quem navega muito no cardápio acumula
 * foto sem fim no celular — e aparelho cheio é o tipo de coisa que faz o
 * cliente desinstalar o app.
 */
const MAX_IMAGENS = 60

const EH_IMAGEM = /\.(?:png|jpe?g|webp|svg|ico)$/i

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      .then((cache) => cache.addAll(ESSENCIAIS))
      // sem esperar a aba antiga fechar: quem instalou a versão nova quer a nova
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter(
              (nome) =>
                nome.startsWith(PREFIXO) && nome !== CACHE_ESTATICO && nome !== CACHE_IMAGENS
            )
            .map((nome) => caches.delete(nome))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request
  if (requisicao.method !== 'GET') return

  const url = new URL(requisicao.url)

  // Outro domínio (foto do Supabase, checkout do pagamento) o navegador
  // resolve melhor sozinho — resposta opaca só ocuparia espaço.
  if (url.origin !== self.location.origin) return

  // O painel e as rotas de API nunca passam por aqui. Comanda, status e
  // dinheiro têm que ser sempre o dado de agora.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return

  // Arquivo de build: o nome muda a cada deploy, então o guardado nunca é o velho.
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(doCachePrimeiro(requisicao))
    return
  }

  if (EH_IMAGEM.test(url.pathname)) {
    evento.respondWith(doCacheEnquantoAtualiza(evento))
    return
  }

  // Página: sempre da rede. Sem rede, a tela de "sem sinal".
  if (requisicao.mode === 'navigate') {
    evento.respondWith(daRedeOuSemSinal(requisicao))
  }
})

async function doCachePrimeiro(requisicao) {
  const cache = await caches.open(CACHE_ESTATICO)
  const guardado = await cache.match(requisicao)
  if (guardado) return guardado

  const resposta = await fetch(requisicao)
  if (resposta.ok) cache.put(requisicao, resposta.clone())
  return resposta
}

/**
 * Devolve na hora o que está guardado e busca a versão nova por trás. A foto
 * trocada pelo dono aparece na visita seguinte — e nunca há espera por imagem.
 */
async function doCacheEnquantoAtualiza(evento) {
  const cache = await caches.open(CACHE_IMAGENS)
  const guardado = await cache.match(evento.request)

  const busca = fetch(evento.request)
    .then(async (resposta) => {
      if (resposta.ok) {
        await cache.put(evento.request, resposta.clone())
        await aparar(cache, MAX_IMAGENS)
      }
      return resposta
    })
    .catch(() => null)

  if (guardado) {
    // segura o worker de pé até a atualização terminar
    evento.waitUntil(busca)
    return guardado
  }

  return (await busca) ?? Response.error()
}

/** Joga fora as mais antigas quando passa do teto (a ordem do cache é a de entrada). */
async function aparar(cache, teto) {
  const chaves = await cache.keys()
  if (chaves.length <= teto) return
  await Promise.all(chaves.slice(0, chaves.length - teto).map((chave) => cache.delete(chave)))
}

async function daRedeOuSemSinal(requisicao) {
  try {
    return await fetch(requisicao)
  } catch {
    const cache = await caches.open(CACHE_ESTATICO)
    return (await cache.match(PAGINA_SEM_SINAL)) ?? Response.error()
  }
}

/* ------------------------------------------------------------------ *
 * Avisos do pedido (push)
 *
 * O servidor manda o JSON montado em src/lib/push.ts. Aqui só desenha.
 * Regra do navegador: todo push recebido PRECISA virar uma notificação
 * visível — se este handler não mostrar nada, o navegador mostra um aviso
 * genérico ou corta a inscrição do aparelho.
 * ------------------------------------------------------------------ */

self.addEventListener('push', (evento) => {
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' }
  }

  const titulo = dados.titulo || 'Churrascaria Brasa Viva'

  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || '',
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      lang: 'pt-BR',
      vibrate: [100, 50, 100],
      // Mesma etiqueta por pedido: o aviso de "pronto" SUBSTITUI o de "em
      // preparo" em vez de empilhar três avisos do mesmo almoço na tela.
      tag: dados.etiqueta || 'pedido',
      renotify: true,
      data: { url: dados.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href

  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // já está com a página do pedido aberta: é só trazer para frente
      for (const janela of janelas) {
        if (janela.url === destino) return janela.focus()
      }

      // está no site, em outra página: leva esta mesma aba para o pedido
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && 'navigate' in janela) {
          await janela.focus()
          return janela.navigate(destino)
        }
      }

      return self.clients.openWindow(destino)
    })()
  )
})
