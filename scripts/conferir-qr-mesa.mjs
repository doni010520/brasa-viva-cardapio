/**
 * Confere o QR Code da mesa de ponta a ponta, do jeito que um cliente faria.
 *
 * Não confia no código que gera o QR: pega o desenho que o painel realmente
 * imprimiu, LÊ os pixels como uma câmera de celular leria, e segue o endereço
 * que saiu de lá. Só assim dá para afirmar que o cartaz colado na mesa leva
 * ao lugar certo.
 *
 * Uso:  node scripts/conferir-qr-mesa.mjs [numero-da-mesa] [url-base]
 *       node scripts/conferir-qr-mesa.mjs 1 https://brasaviva.benitechlab.com
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { mkdir } from 'node:fs/promises'
import { EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'

const MESA = process.argv[2] ?? '1'
const BASE = (process.argv[3] ?? 'https://brasaviva.benitechlab.com').replace(/\/$/, '')
const TIROS = 'C:/Users/adoni/cardapio-online/.testes'
await mkdir(TIROS, { recursive: true })

let passos = 0
let falhas = 0
const ok = (m) => (passos++, console.log(`  [ok] ${m}`))
const falha = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? ok(m) : falha(m))

console.log(`\nConferindo o QR da mesa ${MESA} em ${BASE}\n`)

const navegador = await chromium.launch()

try {
  // ---------------------------------------- 1. pega o QR que o painel imprime
  console.log('1) O cartaz que o dono imprime')
  const painel = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
  const admin = await painel.newPage()

  await admin.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await admin.getByLabel('E-mail').fill(EMAIL_ADMIN)
  await admin.getByLabel('Senha').fill(SENHA_ADMIN)
  await admin.getByRole('button', { name: /Entrar/ }).click()
  await admin.waitForFunction(() => !location.pathname.startsWith('/admin/login'), {
    timeout: 20000,
  })

  await admin.goto(`${BASE}/admin/mesas`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(1500)

  // o cartaz da mesa pedida, e só ele
  const cartaz = admin
    .locator('div', { has: admin.locator('svg') })
    .filter({ hasText: new RegExp(`Mesa ${MESA}\\b`) })
    .last()

  conferir((await cartaz.count()) > 0, `cartaz da mesa ${MESA} existe no painel`)

  const svg = cartaz.locator('svg').first()
  conferir((await svg.count()) > 0, 'o cartaz traz um QR Code desenhado')

  // fotografa SÓ o QR, em tamanho grande, como se fosse o papel na mesa
  const arquivo = `${TIROS}/qr-mesa-${MESA}.png`
  await svg.screenshot({ path: arquivo, scale: 'css' })
  await admin.screenshot({ path: `${TIROS}/qr-mesa-${MESA}-cartaz.png`, fullPage: true })
  await painel.close()

  // ---------------------------------------- 2. lê o QR como uma câmera leria
  console.log('\n2) Lendo o QR pelos pixels, como um celular')
  const AMPLIA = 3
  const imagem = sharp(arquivo).resize({ width: 300 * AMPLIA, kernel: 'nearest' })
  const { data, info } = await imagem
    .flatten({ background: '#ffffff' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const lido = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  conferir(Boolean(lido), 'o QR é legível (decodificou os pixels)')
  if (!lido) throw new Error('não consegui ler o QR')

  const endereco = lido.data
  console.log(`     o QR contém: ${endereco}`)

  const esperado = `${BASE}/mesa/${MESA}`
  conferir(endereco === esperado, `aponta para o endereço certo (${esperado})`)
  conferir(endereco.startsWith('https://'), 'é https, não localhost nem http')

  // ---------------------------------------- 3. segue o link, como o cliente
  console.log('\n3) Seguindo o link num celular limpo')
  const celular = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const cliente = await celular.newPage()

  const resposta = await cliente.goto(endereco, { waitUntil: 'networkidle' })
  conferir(resposta?.status() === 200, `o link abre (HTTP ${resposta?.status()})`)
  conferir(
    cliente.url().replace(/\/$/, '') === BASE,
    `redireciona para o cardápio (${cliente.url()})`
  )

  await cliente.waitForTimeout(1200)

  // ---------------------------------------- 4. chegou como quem está na mesa?
  console.log('\n4) Chegou já sentado à mesa?')
  conferir(
    (await cliente.getByText('Você está no restaurante agora?').count()) === 0,
    'NÃO pergunta onde a pessoa está — o QR já respondeu isso'
  )
  conferir(
    await cliente.getByText(new RegExp(`Mesa ${MESA}\\b`)).first().isVisible(),
    `a tela mostra que é a Mesa ${MESA}`
  )

  const buffet = await cliente.getByRole('button', { name: /Buffet livre/ }).count()
  conferir(buffet > 0, 'o cardápio do salão aparece (buffet livre, que só existe no restaurante)')

  const cookies = await celular.cookies()
  const mesaCookie = cookies.find((c) => c.name === 'mesa')
  const modoCookie = cookies.find((c) => c.name === 'modo_consumo')
  conferir(mesaCookie?.value === MESA, `a mesa ficou guardada no navegador (${mesaCookie?.value})`)
  conferir(modoCookie?.value === 'local', 'o modo ficou como "no restaurante"')

  await cliente.screenshot({ path: `${TIROS}/qr-mesa-${MESA}-destino.png`, fullPage: true })

  // ---------------------------------------- 5. a mesa acompanha o pedido?
  console.log('\n5) A mesa acompanha o cliente até o checkout')
  await cliente.getByRole('button', { name: /Buffet livre/ }).first().click()
  await cliente.waitForTimeout(700)
  await cliente.getByRole('button', { name: /^Adicionar/ }).click()
  await cliente.waitForTimeout(700)
  await cliente.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await cliente.waitForTimeout(1000)
  conferir(
    await cliente.getByText(new RegExp(`Mesa ${MESA}\\b`)).first().isVisible(),
    'o checkout sabe de qual mesa é o pedido'
  )
  await cliente.screenshot({ path: `${TIROS}/qr-mesa-${MESA}-checkout.png`, fullPage: true })

  // ---------------------------------------- 6. mesa que não existe
  console.log('\n6) Mesa que não existe')
  const outro = await navegador.newContext({ viewport: { width: 390, height: 844 } })
  const curioso = await outro.newPage()
  await curioso.goto(`${BASE}/mesa/999`, { waitUntil: 'networkidle' })
  await curioso.waitForTimeout(1000)
  const cookiesFalsos = await outro.cookies()
  conferir(
    !cookiesFalsos.find((c) => c.name === 'mesa'),
    'QR de mesa inexistente não carimba mesa nenhuma'
  )
  await outro.close()
} catch (erro) {
  falha(`quebrou no meio: ${erro.message}`)
} finally {
  await navegador.close()
}

console.log(`\n${'='.repeat(52)}`)
console.log(`  ${passos} verificações ok, ${falhas} falha(s)`)
console.log('='.repeat(52))
process.exit(falhas ? 1 : 0)
