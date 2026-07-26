/**
 * Testa o histórico do cliente — que existe sem conta e sem senha.
 *
 * Como funciona a decisão de negócio:
 *   - o telefone é OBRIGATÓRIO no checkout: é ele que amarra o pedido à ficha
 *     do cliente, e é assim que o dono tem o histórico dele;
 *   - do lado do cliente, /meus-pedidos mostra o que ESTE navegador guardou,
 *     e a conversa de WhatsApp guarda o link de cada pedido;
 *   - um aparelho NUNCA vê o pedido de outra pessoa — é aí que moraria o
 *     vazamento de nome, endereço e histórico de quem comprou.
 *
 * Uso:  node scripts/teste-meus-pedidos.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { env, EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'
import { limparDadosDeTeste } from './limpeza.mjs'

const BASE = 'http://localhost:3000'
const TIROS = 'C:/Users/adoni/cardapio-online/.testes'
await mkdir(TIROS, { recursive: true })

let passos = 0
let falhas = 0
const ok = (m) => (passos++, console.log(`  [ok] ${m}`))
const falha = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? ok(m) : falha(m))

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

// Só o rastro dos testes anteriores. Pedido de gente de verdade fica de pé.
await limparDadosDeTeste(sql)

const navegador = await chromium.launch()

// Contexto = aparelho. Contextos separados de propósito: é o localStorage que
// separa um cliente do outro, e compartilhar invalidaria o teste 5.
const celularDoCliente = await navegador.newContext({ viewport: { width: 420, height: 900 } })
const pagina = await celularDoCliente.newPage()

const errosDeConsole = []
pagina.on('console', (m) => m.type() === 'error' && errosDeConsole.push(m.text()))
pagina.on('pageerror', (e) => errosDeConsole.push(String(e)))

try {
  // ------------------------------------------- 1. sem pedido nenhum
  console.log('\n1) Aparelho que nunca pediu')
  await pagina.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  conferir(
    await pagina.getByText('Nenhum pedido por aqui').isVisible(),
    'tela vazia explica que ainda não há pedidos'
  )
  conferir(
    await pagina.getByRole('link', { name: /Ver cardápio/ }).isVisible(),
    'oferece caminho de volta para o cardápio'
  )
  conferir(
    await pagina.getByRole('link', { name: /Entrar com o WhatsApp/ }).isVisible(),
    'convida a entrar para levar o histórico para outros aparelhos'
  )
  await pagina.screenshot({ path: `${TIROS}/mp-01-vazio.png`, fullPage: true })

  // ------------------------------------------- 2. telefone é obrigatório
  console.log('\n2) O telefone é obrigatório no checkout')
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: /é para viagem/i }).click()
  await pagina.waitForTimeout(1800)

  await pagina.getByRole('button', { name: /Cocada baiana/ }).first().click()
  await pagina.waitForTimeout(400)
  await pagina.getByRole('button', { name: /^Adicionar/ }).click()
  await pagina.waitForTimeout(600)

  await pagina.getByRole('link', { name: /Ver carrinho/ }).click()
  await pagina.waitForURL('**/carrinho')
  await pagina.getByRole('link', { name: /Fechar pedido/ }).click()
  await pagina.waitForURL('**/checkout')
  await pagina.waitForTimeout(600)

  const campoTelefone = pagina.getByLabel('Telefone (WhatsApp)')
  conferir(
    await campoTelefone.evaluate((el) => el.required),
    'campo de telefone é marcado como obrigatório'
  )
  conferir(
    await pagina.getByText(/Obrigatório.*acha o seu pedido/s).isVisible(),
    'a tela explica por que o telefone é pedido'
  )

  // sem telefone o navegador nem deixa enviar; com telefone curto, o servidor barra
  await pagina.getByLabel('Nome').fill('Cliente Historico')
  await campoTelefone.fill('7198')
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForTimeout(1800)
  conferir(
    pagina.url().includes('/checkout'),
    'telefone incompleto não fecha pedido (o servidor recusa)'
  )

  // ------------------------------------------- 3. pedido de verdade
  console.log('\n3) Pedido feito e amarrado ao telefone')
  await campoTelefone.fill('71988886666')
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  const pedidoId = pagina.url().split('/pedido/')[1].split('/')[0]
  ok(`pedido criado: ${pedidoId}`)

  const guardados = await pagina.evaluate(() =>
    JSON.parse(localStorage.getItem('cardapio:pedidos') ?? '[]')
  )
  conferir(guardados.includes(pedidoId), 'navegador guardou o id do pedido sozinho')

  // é isto que dá o histórico ao DONO: ficha do cliente montada pelo gatilho
  const ficha = await sql(`
    select c.nome, c.telefone, c.total_pedidos
    from public.clientes c
    join public.pedidos p on p.cliente_id = c.id
    where p.id = '${pedidoId}';`)
  const linha = Array.isArray(ficha) ? ficha[0] : ficha?.[0]
  conferir(
    linha?.telefone === '71988886666',
    `pedido vinculado à ficha do cliente pelo telefone (${linha?.telefone ?? 'nenhuma'})`
  )
  conferir(linha?.total_pedidos >= 1, `ficha já contabiliza ${linha?.total_pedidos} pedido(s)`)

  // ------------------------------------------- 4. o pedido aparece
  console.log('\n4) Histórico no mesmo aparelho')
  await pagina.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  conferir(await pagina.getByText('Em andamento').isVisible(), 'pedido entra como "Em andamento"')
  conferir(
    await pagina.getByText('Cocada baiana').first().isVisible(),
    'lista mostra o que a pessoa pediu'
  )
  const linhaDoPedido = pagina.locator(`a[href="/pedido/${pedidoId}"]`)
  conferir((await linhaDoPedido.count()) > 0, 'linha leva para o acompanhamento do pedido')
  await pagina.screenshot({ path: `${TIROS}/mp-02-com-pedido.png`, fullPage: true })

  // chegar no acompanhamento pelo histórico, não pelo link salvo
  await linhaDoPedido.first().click()
  await pagina.waitForURL(`**/pedido/${pedidoId}`)
  await pagina.waitForTimeout(800)
  conferir(
    await pagina.getByText(/Preparando|Recebido|Pedido recebido|Aguardando/).first().isVisible(),
    'clicar na linha abre o acompanhamento em andamento'
  )

  // ------------------------------------------- 5. status muda na cozinha
  console.log('\n5) Status muda na cozinha e reflete no histórico')
  const painel = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
  const paginaAdmin = await painel.newPage()
  await paginaAdmin.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await paginaAdmin.getByLabel('E-mail').fill(EMAIL_ADMIN)
  await paginaAdmin.getByLabel('Senha').fill(SENHA_ADMIN)
  await paginaAdmin.getByRole('button', { name: /Entrar/ }).click()
  await paginaAdmin.waitForFunction(() => !location.pathname.startsWith('/admin/login'), {
    timeout: 20000,
  })
  await paginaAdmin.waitForTimeout(1200)

  // o dono enxerga a pessoa por trás do pedido — este é o histórico dele
  await paginaAdmin.goto(`${BASE}/admin/clientes`, { waitUntil: 'networkidle' })
  await paginaAdmin.waitForTimeout(1200)
  conferir(
    await paginaAdmin.getByText('Cliente Historico').first().isVisible(),
    'o dono vê o cliente na tela de clientes, sem ele ter feito cadastro'
  )
  await painel.close()

  await sql(`update public.pedidos set status = 'pronto' where id = '${pedidoId}';`)
  await pagina.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  conferir(
    await pagina.getByText(/Pronto/i).first().isVisible(),
    'histórico mostra o pedido já pronto'
  )

  await sql(`update public.pedidos set status = 'retirado' where id = '${pedidoId}';`)
  await pagina.reload({ waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  conferir(
    await pagina.getByText('Pedidos anteriores').isVisible(),
    'pedido concluído desce para "Pedidos anteriores"'
  )
  conferir(
    (await pagina.getByText('Em andamento').count()) === 0,
    'nada fica preso em "Em andamento" depois de entregue'
  )
  await pagina.screenshot({ path: `${TIROS}/mp-03-concluido.png`, fullPage: true })

  // ------------------------------------------- 6. o teste que importa
  console.log('\n6) Aparelho de outra pessoa NÃO vê este pedido')
  const outroCelular = await navegador.newContext({ viewport: { width: 420, height: 900 } })
  const estranho = await outroCelular.newPage()
  await estranho.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await estranho.waitForTimeout(1500)
  conferir(
    await estranho.getByText('Nenhum pedido por aqui').isVisible(),
    'outro aparelho vê a tela vazia'
  )
  conferir(
    (await estranho.getByText('Cliente Historico').count()) === 0 &&
      (await estranho.getByText('Cocada baiana').count()) === 0,
    'nome e itens de quem comprou não vazam para outro aparelho'
  )

  // forjar um id que não é seu também não pode funcionar
  await estranho.evaluate(
    (id) => localStorage.setItem('cardapio:pedidos', JSON.stringify(['nao-e-uuid', id + 'x'])),
    pedidoId
  )
  await estranho.reload({ waitUntil: 'networkidle' })
  await estranho.waitForTimeout(1500)
  conferir(
    await estranho.getByText('Nenhum pedido por aqui').isVisible(),
    'id inválido ou chutado não devolve pedido nenhum'
  )
  await outroCelular.close()

  // ------------------------------------------- 6b. TROCAR DE APARELHO
  // Este é o caso que motivou o login: pedir num celular e olhar noutro.
  console.log('\n6b) Entrar com o WhatsApp em OUTRO aparelho')
  const celularNovo = await navegador.newContext({ viewport: { width: 420, height: 900 } })
  const outro = await celularNovo.newPage()

  await outro.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await outro.waitForTimeout(600)

  await outro.getByLabel('Seu WhatsApp').fill('123')
  await outro.getByRole('button', { name: /Receber código/ }).click()
  await outro.waitForTimeout(1500)
  conferir(await outro.getByText(/Confira o número/).isVisible(), 'número curto é recusado')

  await outro.getByLabel('Seu WhatsApp').fill('71988886666')
  await outro.getByRole('button', { name: /Receber código/ }).click()
  await outro.waitForTimeout(2500)
  conferir(
    await outro.getByLabel(/Código de 6 dígitos/).isVisible(),
    'tela pede o código de 6 dígitos'
  )
  await outro.screenshot({ path: `${TIROS}/mp-04-codigo.png`, fullPage: true })

  let codigoReal = null
  if (await outro.getByText(/Modo demonstração/).isVisible().catch(() => false)) {
    const texto = await outro.getByText(/o código aparece aqui/).textContent()
    codigoReal = texto?.match(/(\d{6})/)?.[1] ?? null
    ok('sem WhatsApp conectado, o código aparece na tela COM aviso de demonstração')
  }

  await outro.getByLabel(/Código de 6 dígitos/).fill(codigoReal === '000000' ? '111111' : '000000')
  await outro.getByRole('button', { name: /Ver meus pedidos/ }).click()
  await outro.waitForTimeout(2000)
  conferir(
    (await outro.getByText(/Código errado|Código expirado/).count()) > 0,
    'código errado é recusado'
  )
  conferir(!outro.url().includes('/meus-pedidos'), 'código errado não deixa entrar')

  if (codigoReal) {
    await outro.getByLabel(/Código de 6 dígitos/).fill(codigoReal)
    await outro.getByRole('button', { name: /Ver meus pedidos/ }).click()
    await outro.waitForURL('**/meus-pedidos', { timeout: 20000 })
    await outro.waitForTimeout(2000)

    conferir(
      await outro.getByText(/Entrou como|Entrou com/).isVisible(),
      'entrou e a tela diz de quem é a conta'
    )
    conferir(
      await outro.getByText('Cocada baiana').first().isVisible(),
      'O PEDIDO APARECE no aparelho novo, sem nunca ter pedido nele'
    )
    await outro.screenshot({ path: `${TIROS}/mp-05-logado.png`, fullPage: true })

    // o mesmo código não pode servir duas vezes
    const terceiro = await navegador.newContext({ viewport: { width: 420, height: 900 } })
    const reuso = await terceiro.newPage()
    await reuso.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
    await reuso.getByLabel('Seu WhatsApp').fill('71988886666')
    await reuso.getByRole('button', { name: /Receber código/ }).click()
    await reuso.waitForTimeout(2000)
    await reuso.getByLabel(/Código de 6 dígitos/).fill(codigoReal)
    await reuso.getByRole('button', { name: /Ver meus pedidos/ }).click()
    await reuso.waitForTimeout(2000)
    conferir(!reuso.url().includes('/meus-pedidos'), 'código já usado não entra de novo')
    await terceiro.close()

    // a sessão sobrevive a fechar o navegador
    const biscoito = (await celularNovo.cookies()).find((c) => c.name === 'bv_cliente')
    conferir(biscoito?.httpOnly === true, 'sessão em cookie httpOnly (JavaScript não lê)')
    const dias = (biscoito.expires * 1000 - Date.now()) / 86400000
    conferir(dias > 300, `cookie dura ${Math.round(dias)} dias — não some ao fechar o navegador`)

    const abaNova = await celularNovo.newPage()
    await abaNova.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
    await abaNova.waitForTimeout(1500)
    conferir(
      await abaNova.getByText(/Entrou como|Entrou com/).isVisible(),
      'abrir de novo mais tarde continua logado'
    )
    await abaNova.close()

    // checkout já preenchido
    await outro.goto(BASE, { waitUntil: 'networkidle' })
    await outro.getByRole('button', { name: /é para viagem/i }).click()
    await outro.waitForTimeout(1500)
    await outro.getByRole('button', { name: /Cocada baiana/ }).first().click()
    await outro.waitForTimeout(400)
    await outro.getByRole('button', { name: /^Adicionar/ }).click()
    await outro.waitForTimeout(500)
    await outro.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
    await outro.waitForTimeout(1200)
    conferir(
      (await outro.getByLabel('Nome').inputValue()) === 'Cliente Historico',
      'checkout já vem com o nome de quem entrou'
    )

    // sair mata a sessão no banco, não só no navegador
    await outro.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
    await outro.waitForTimeout(1500)
    await outro.getByRole('button', { name: 'Sair' }).click()
    await outro.waitForTimeout(2000)
    await outro.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
    await outro.waitForTimeout(1500)
    conferir(
      await outro.getByRole('link', { name: /Entrar com o WhatsApp/ }).isVisible(),
      'depois de sair, volta a ser um aparelho anônimo'
    )
  } else {
    falha('não consegui obter o código para concluir o login')
  }
  await celularNovo.close()

  // ------------------------------------------- 7. caminho até a tela
  console.log('\n7) Caminho até a tela')
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)
  conferir(
    await pagina.getByRole('link', { name: 'Meus pedidos' }).first().isVisible(),
    'atalho para "Meus pedidos" no topo de todas as telas'
  )

  conferir(errosDeConsole.length === 0, `sem erro no console (${errosDeConsole.length})`)
  if (errosDeConsole.length) console.log('    ', errosDeConsole.slice(0, 3))
} catch (erro) {
  falha(`quebrou no meio: ${erro.message}`)
  await pagina.screenshot({ path: `${TIROS}/mp-erro.png`, fullPage: true }).catch(() => {})
} finally {
  await navegador.close()
}

console.log(`\n${'='.repeat(52)}`)
console.log(`  ${passos} verificações ok, ${falhas} falha(s)`)
console.log('='.repeat(52))
process.exit(falhas ? 1 : 0)
