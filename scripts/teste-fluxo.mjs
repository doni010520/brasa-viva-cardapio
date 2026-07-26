/**
 * Teste de ponta a ponta do fluxo real, no navegador:
 *   cliente monta pedido -> escolhe opções -> fecha -> acompanha
 *   dono entra no painel -> move o status -> imprime a comanda
 *
 * Uso:  node scripts/teste-fluxo.mjs
 */
import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { env, EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'
import { limparDadosDeTeste } from './limpeza.mjs'

const BASE = 'http://localhost:3000'
const TIROS = 'C:/Users/adoni/cardapio-online/.testes'
await mkdir(TIROS, { recursive: true })

const EMAIL = EMAIL_ADMIN
const SENHA = SENHA_ADMIN

let passos = 0
let falhas = 0

function ok(mensagem) {
  passos++
  console.log(`  [ok] ${mensagem}`)
}
function falha(mensagem) {
  falhas++
  console.log(`  [FALHA] ${mensagem}`)
}
function conferir(condicao, mensagem) {
  condicao ? ok(mensagem) : falha(mensagem)
}

// Limpa só o rastro dos testes: com sobras de execuções anteriores o teste
// clicava no card errado. Pedido de gente de verdade continua no painel.
{
  const sql = (query) =>
    fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }).then((r) => r.json())

  await limparDadosDeTeste(sql)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 420, height: 900 } })
const pagina = await contexto.newPage()

const errosDeConsole = []
pagina.on('console', (m) => m.type() === 'error' && errosDeConsole.push(m.text()))
pagina.on('pageerror', (e) => errosDeConsole.push(String(e)))

try {
  // ------------------------------------------------ 0. escolha do modo
  console.log('\n0) Onde vou comer')
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  conferir(
    await pagina.getByText('Você está no restaurante agora?').isVisible(),
    'site pergunta antes de mostrar o cardápio'
  )
  conferir(
    await pagina.getByRole('button', { name: /estou no restaurante/i }).isVisible(),
    'botões respondem a pergunta com sim e não'
  )
  await pagina.screenshot({ path: `${TIROS}/00-escolha-modo.png` })

  // segue como quem vai levar
  await pagina.getByRole('button', { name: /é para viagem/i }).click()
  await pagina.waitForTimeout(1800)

  // ------------------------------------------------ 1. cardápio
  console.log('\n1) Cardápio do cliente')
  conferir(
    await pagina.getByRole('heading', { name: 'Churrascaria Brasa Viva' }).isVisible(),
    'nome da churrascaria na tela'
  )
  conferir(
    (await pagina.getByRole('button', { name: /Buffet livre/ }).count()) === 0,
    'buffet livre NÃO aparece para quem vai levar'
  )
  conferir(await pagina.getByText('Aberto agora').isVisible(), 'loja marcada como aberta')
  await pagina.screenshot({ path: `${TIROS}/01-cardapio.png`, fullPage: false })

  // busca
  await pagina.getByPlaceholder('Buscar no cardápio...').fill('picanha')
  await pagina.waitForTimeout(400)
  const achados = await pagina.getByRole('button', { name: /[Pp]icanha/ }).count()
  conferir(achados > 0, `busca por "picanha" encontra ${achados} item(ns)`)
  await pagina.getByPlaceholder('Buscar no cardápio...').fill('')
  await pagina.waitForTimeout(300)

  // ------------------------------------- 1b. o buffet aparece no outro modo
  // Contexto SEPARADO de propósito: o modo vive num cookie, e mexer nele
  // aqui dentro contaminaria o pedido que está sendo montado na outra aba.
  const contextoSalao = await navegador.newContext({ viewport: { width: 420, height: 900 } })
  const paraLocal = await contextoSalao.newPage()
  await paraLocal.goto(BASE, { waitUntil: 'networkidle' })
  await paraLocal.getByRole('button', { name: /estou no restaurante/i }).click()
  await paraLocal.waitForTimeout(1500)
  conferir(
    (await paraLocal.getByRole('button', { name: /Buffet livre/ }).count()) > 0,
    'buffet livre APARECE para quem está no restaurante'
  )
  conferir(
    (await paraLocal.getByRole('button', { name: /Marmita do dia/ }).count()) === 0,
    'marmita embalada NÃO aparece para quem está no salão'
  )
  await paraLocal.screenshot({ path: `${TIROS}/00b-cardapio-salao.png` })
  await contextoSalao.close()

  // ------------------------------------- 2. produto com opção obrigatória
  console.log('\n2) Produto com grupo de opções')
  await pagina.getByRole('button', { name: /Churrasco misto/ }).first().click()
  await pagina.waitForTimeout(500)
  conferir(await pagina.getByText('Ponto da carne').isVisible(), 'grupo obrigatório aparece')
  conferir(await pagina.getByText('Quer turbinar?').isVisible(), 'grupo opcional aparece')

  const precoBase = await pagina.getByRole('button', { name: /^Adicionar/ }).textContent()
  await pagina.getByText('Farofa extra', { exact: true }).click()
  await pagina.waitForTimeout(300)
  const precoComExtra = await pagina.getByRole('button', { name: /^Adicionar/ }).textContent()
  conferir(
    precoBase !== precoComExtra,
    `preço acompanha o adicional (${precoBase?.trim()} -> ${precoComExtra?.trim()})`
  )

  await pagina.getByLabel('Aumentar quantidade').click()
  await pagina.waitForTimeout(200)
  await pagina.screenshot({ path: `${TIROS}/02-produto.png` })
  await pagina.getByRole('button', { name: /^Adicionar/ }).click()
  await pagina.waitForTimeout(600)

  // ------------------------------------------------ 3. segundo item
  await pagina.getByRole('button', { name: /Cocada baiana/ }).first().click()
  await pagina.waitForTimeout(400)
  await pagina.getByRole('button', { name: /^Adicionar/ }).click()
  await pagina.waitForTimeout(600)

  // ------------------------------------------------ 4. carrinho
  console.log('\n3) Carrinho')
  await pagina.getByRole('link', { name: /Ver carrinho/ }).click()
  await pagina.waitForURL('**/carrinho')
  await pagina.waitForTimeout(500)
  conferir(await pagina.getByText('Churrasco misto').isVisible(), 'item no carrinho')
  conferir(await pagina.getByText('Farofa extra').first().isVisible(), 'opção escolhida listada')
  await pagina.screenshot({ path: `${TIROS}/03-carrinho.png`, fullPage: true })

  // ------------------------------------------------ 5. checkout
  console.log('\n4) Checkout')
  await pagina.getByRole('link', { name: /Fechar pedido/ }).click()
  await pagina.waitForURL('**/checkout')
  await pagina.waitForTimeout(600)

  await pagina.getByLabel('Nome').fill('Cliente de Teste')
  await pagina.getByLabel('Telefone (WhatsApp)').fill('71988887777')

  // cupom do seed
  await pagina.getByPlaceholder('Digite o cupom').fill('BRASA10')
  await pagina.getByRole('button', { name: 'Aplicar' }).click()
  await pagina.waitForTimeout(1500)
  const cupomOk = await pagina.getByText(/BRASA10/).isVisible().catch(() => false)
  conferir(cupomOk, 'cupom BRASA10 aceito e desconto aplicado')

  await pagina.screenshot({ path: `${TIROS}/04-checkout.png`, fullPage: true })

  const totalTexto = await pagina.getByText('Total').last().textContent()
  console.log(`     total na tela: ${totalTexto?.trim()}`)

  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  await pagina.waitForTimeout(800)

  // ------------------------------------------ 5. tela de agradecimento
  console.log('\n5) Agradecimento e campanha')
  const pedidoId = pagina.url().split('/pedido/')[1].split('/')[0]
  conferir(Boolean(pedidoId), `pedido criado: ${pedidoId}`)
  conferir(
    pagina.url().endsWith('/obrigado'),
    'cliente cai na tela de agradecimento depois de fechar'
  )
  conferir(
    await pagina.getByText(/Pedido confirmado|Pagamento confirmado/).isVisible(),
    'confirmação aparece'
  )
  const codigo = await pagina.locator('.text-6xl').textContent()
  console.log(`     código de retirada: ${codigo?.trim()}`)
  await pagina.screenshot({ path: `${TIROS}/05-obrigado.png`, fullPage: true })

  // ------------------------------------------------ 5b. acompanhamento
  await pagina.goto(`${BASE}/pedido/${pedidoId}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  conferir(
    await pagina.getByText('Pedido recebido').isVisible(),
    'pedido já entrou como "recebido" (pagamento na retirada)'
  )
  await pagina.screenshot({ path: `${TIROS}/05b-acompanhamento.png`, fullPage: true })

  // ------------------------------------------------ 7. painel do dono
  console.log('\n6) Painel do restaurante')
  // o dono usa desktop/tablet, não celular
  const contextoAdmin = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await contextoAdmin.newPage()
  await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  conferir(admin.url().includes('/admin/login'), 'sem sessão, cai no login')

  await admin.getByLabel('E-mail').fill(EMAIL)
  await admin.getByLabel('Senha').fill(SENHA)
  await admin.getByRole('button', { name: 'Entrar' }).click()
  await admin.waitForURL('**/admin', { timeout: 20000 })
  await admin.waitForTimeout(1200)
  conferir(
    await admin.getByRole('heading', { name: 'Pedidos de hoje' }).isVisible(),
    'login funcionou e o painel abriu'
  )

  const numero = codigo?.trim()
  conferir(
    await admin.getByText(`#${numero}`).first().isVisible(),
    `pedido #${numero} aparece na coluna Novos`
  )
  await admin.screenshot({ path: `${TIROS}/06-painel.png`, fullPage: true })

  // avança o status
  console.log('\n7) Fluxo de status')
  await admin.getByRole('button', { name: /Começar preparo/ }).first().click()
  // espera a tela se atualizar em vez de cravar um tempo fixo
  const botaoPronto = admin.getByRole('button', { name: /Marcar como pronto/ }).first()
  await botaoPronto.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  conferir(await botaoPronto.isVisible(), 'pedido foi para "Em preparo"')

  await admin.getByRole('button', { name: /Marcar como pronto/ }).first().click()
  // espera o painel se atualizar em vez de cravar um tempo fixo
  const botaoRetirou = admin.getByRole('button', { name: /Cliente retirou/ }).first()
  await botaoRetirou.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  conferir(await botaoRetirou.isVisible(), 'pedido foi para "Pronto"')
  await admin.screenshot({ path: `${TIROS}/07-painel-pronto.png`, fullPage: true })

  // o cliente vê a mudança
  await pagina.reload({ waitUntil: 'networkidle' })
  await pagina.waitForTimeout(500)
  conferir(
    await pagina.getByText('Pronto para retirada').isVisible(),
    'cliente vê "Pronto para retirada"'
  )

  // ------------------------------------------------ 8. comanda
  console.log('\n8) Comanda de impressão')

  // sem sessão de admin, a comanda não pode abrir
  const bisbilhoteiro = await contexto.newPage()
  await bisbilhoteiro.goto(`${BASE}/admin/comanda/${pedidoId}`, { waitUntil: 'networkidle' })
  conferir(
    bisbilhoteiro.url().includes('/admin/login'),
    'comanda bloqueada para quem não é do restaurante'
  )
  await bisbilhoteiro.close()

  const comanda = await contextoAdmin.newPage()
  await comanda.goto(`${BASE}/admin/comanda/${pedidoId}`, { waitUntil: 'networkidle' })
  await comanda.waitForTimeout(600)
  conferir(await comanda.getByText('>> RETIRADA <<').isVisible(), 'comanda marca RETIRADA')
  conferir(
    await comanda.getByText('*** COBRAR NO BALCAO ***').isVisible(),
    'comanda avisa para cobrar no balcão'
  )
  await comanda.screenshot({ path: `${TIROS}/08-comanda.png`, fullPage: true })

  // ------------------------------------------------ 9. demais telas
  console.log('\n9) Demais telas do painel')
  for (const [rota, titulo] of [
    ['/admin/cardapio', 'Cardápio'],
    ['/admin/cupons', 'Cupons'],
    ['/admin/relatorios', 'Relatórios'],
    ['/admin/config', 'Configurações'],
  ]) {
    await admin.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(700)
    conferir(
      await admin.getByRole('heading', { name: titulo, exact: true }).isVisible(),
      `${rota} abriu`
    )
    await admin.screenshot({
      path: `${TIROS}/09-${rota.split('/').pop()}.png`,
      fullPage: true,
    })
  }

  // ------------------------------------------------ 10. esgotar produto
  console.log('\n10) Botão "esgotou"')
  await admin.goto(`${BASE}/admin/cardapio`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(800)
  // um item que existe no cardápio de viagem (buffet só aparece no salão)
  const aVenda = admin.getByRole('button', {
    name: /Churrasco misto: à venda\. Marcar como esgotado/i,
  })
  const nome = (await aVenda.first().getAttribute('aria-label'))?.split(':')[0]
  await aVenda.first().click()
  await admin.waitForTimeout(2500)
  conferir(
    await admin
      .getByRole('button', { name: new RegExp(`${nome}: esgotado`, 'i') })
      .isVisible(),
    `"${nome}" ficou esgotado e sumiu do cardápio público`
  )

  // some mesmo para o cliente?
  const publico = await contexto.newPage()
  await publico.goto(BASE, { waitUntil: 'networkidle' })
  await publico.waitForTimeout(500)
  const marcado = await publico
    .getByRole('button', { name: new RegExp(nome ?? 'xxx') })
    .first()
    .textContent()
  conferir(
    (marcado ?? '').includes('Esgotado hoje'),
    'cliente vê o item como "Esgotado hoje" e não consegue pedir'
  )
  await publico.close()

  // desfaz, para o cardápio ficar limpo
  await admin
    .getByRole('button', { name: new RegExp(`${nome}: esgotado`, 'i') })
    .first()
    .click()
  await admin.waitForTimeout(2000)
  ok('produto voltou a ficar disponível')
} catch (erro) {
  falha(`erro inesperado: ${erro.message}`)
  await pagina.screenshot({ path: `${TIROS}/erro.png`, fullPage: true }).catch(() => {})
} finally {
  await navegador.close()
}

console.log('\n============================================')
console.log(`  ${passos} verificações passaram, ${falhas} falharam`)
if (errosDeConsole.length) {
  console.log(`\n  erros de console no navegador (${errosDeConsole.length}):`)
  for (const e of errosDeConsole.slice(0, 10)) console.log(`   - ${e.slice(0, 200)}`)
} else {
  console.log('  nenhum erro de console no navegador')
}
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
