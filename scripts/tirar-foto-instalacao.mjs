/**
 * Tira as fotos que o Android mostra na tela de instalação do app.
 *
 * Com elas no manifesto, o "adicionar à tela de início" deixa de ser uma linha
 * seca e vira um cartão com prévia — o mesmo tratamento que um app de loja
 * ganha. Sem elas o convite continua funcionando, só mais apagado.
 *
 * Uso:  node scripts/tirar-foto-instalacao.mjs [url]
 *       (sem url, usa o site no ar)
 *
 * Rode com a loja ABERTA: fora do horário o cardápio sai com a tarja
 * "Estamos fechados", e essa foto fica congelada no convite de instalação.
 *
 * As medidas aqui têm que bater com as declaradas em src/app/manifest.ts.
 */
import { chromium } from 'playwright'

const site = (process.argv[2] ?? 'https://brasavivadd.com').replace(/\/$/, '')
const destino = new URL('../public/', import.meta.url).pathname.replace(/^\//, '')

const navegador = await chromium.launch()

/** O cardápio só aparece depois de responder "no restaurante ou para viagem?". */
async function abrirCardapio(pagina) {
  await pagina.goto(site, { waitUntil: 'networkidle' })
  const botao = pagina.getByRole('button', { name: /é para viagem/i })
  if (await botao.count()) {
    await botao.first().click()
    await pagina.waitForLoadState('networkidle')
  }
  // deixa as fotos dos pratos terminarem de chegar
  await pagina.waitForTimeout(2500)
}

for (const foto of [
  { arquivo: 'tela-celular.png', largura: 540, altura: 960, escala: 2, formato: 'narrow' },
  { arquivo: 'tela-computador.png', largura: 1280, altura: 720, escala: 1, formato: 'wide' },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: foto.largura, height: foto.altura },
    deviceScaleFactor: foto.escala,
    isMobile: foto.formato === 'narrow',
  })
  const pagina = await contexto.newPage()
  await abrirCardapio(pagina)
  await pagina.screenshot({ path: `${destino}${foto.arquivo}` })
  await contexto.close()

  console.log(
    `${foto.arquivo}: ${foto.largura * foto.escala}x${foto.altura * foto.escala} (${foto.formato})`
  )
}

await navegador.close()
console.log('\nPronto. Se mudar as medidas, atualize src/app/manifest.ts.')
