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

// Painel limpo: com sobras de execuções anteriores o teste clica no card errado.
await sql('delete from public.pedidos;')

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
  // O "Acesso da equipe" do rodapé é do dono e continua existindo; o que não
  // pode existir é login de CLIENTE.
  conferir(
    (await pagina.locator('a[href="/entrar"]').count()) === 0 &&
      (await pagina.getByText(/Entrar com o WhatsApp|código de 6 dígitos/i).count()) === 0,
    'não existe login de cliente em lugar nenhum'
  )
  conferir(
    (await pagina.request.get(`${BASE}/entrar`)).status() === 404,
    'a rota /entrar deixou de existir'
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
