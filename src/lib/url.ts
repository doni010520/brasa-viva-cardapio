import { headers } from 'next/headers'

/**
 * O endereço público da loja.
 *
 * Por que existe um `URL_BASE` sem o prefixo NEXT_PUBLIC_: toda variável que
 * começa com NEXT_PUBLIC_ é GRAVADA DENTRO do código no momento do build.
 * Isso é necessário para o que o navegador precisa enxergar — mas este valor
 * só é lido no servidor. Com o prefixo, trocar o domínio virava um rebuild;
 * sem ele, é mexer no Environment e reiniciar.
 *
 * A ordem de preferência cobre os dois mundos:
 *   1. URL_BASE          — variável de ambiente comum, vale na hora
 *   2. NEXT_PUBLIC_URL_BASE — o jeito antigo, para deploys que já existem
 *   3. cabeçalhos do proxy  — último recurso, se ninguém configurou nada
 */

export function urlBaseConfigurada() {
  const escolhida = process.env.URL_BASE || process.env.NEXT_PUBLIC_URL_BASE || ''
  return escolhida.replace(/\/$/, '')
}

/**
 * Igual à de cima, mas com o endereço da requisição como rede de segurança.
 *
 * Atenção: NUNCA use `request.url` para isso. Atrás de um proxy, o app enxerga
 * o próprio endereço interno — foi assim que o QR das mesas passou a apontar
 * para `https://0.0.0.0:3000/` em produção. Os cabeçalhos `x-forwarded-*` são
 * o que o proxy realmente informa sobre o mundo de fora.
 */
export async function urlBase() {
  const configurada = urlBaseConfigurada()
  if (configurada) return configurada

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}
