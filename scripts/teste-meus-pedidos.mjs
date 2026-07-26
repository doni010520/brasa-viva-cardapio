/**
 * Testa a tela "Meus pedidos" — o histórico do cliente sem conta e sem senha.
 *
 * O que precisa ser verdade:
 *   1. quem fez um pedido vê o pedido, na hora, sem digitar nada;
 *   2. o status acompanha o que a cozinha está fazendo;
 *   3. um aparelho NUNCA vê o pedido de outra pessoa — é aí que mora o risco
 *      de vazar nome, telefone e endereço de quem comprou.
 *
 * Uso:  node scripts/teste-meus-pedidos.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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
await sql('delete from public.pedidos; delete from public.sessoes_cliente; delete from public.codigos_acesso;')

const navegador = await chromium.launch()

// Contexto = aparelho. Dois contextos separados porque o localStorage é o que
// separa um cliente do outro; compartilhar o contexto invalidaria o teste 3.
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
  await pagina.screenshot({ path: `${TIROS}/mp-01-vazio.png`, fullPage: true })

  // ------------------------------------------- 2. faz um pedido
  console.log('\n2) Cliente faz um pedido')
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

  await pagina.getByLabel('Nome').fill('Cliente Historico')
  await pagina.getByLabel('Telefone (WhatsApp)').fill('71988886666')
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  const pedidoId = pagina.url().split('/pedido/')[1].split('/')[0]
  ok(`pedido criado: ${pedidoId}`)

  const guardados = await pagina.evaluate(() =>
    JSON.parse(localStorage.getItem('cardapio:pedidos') ?? '[]')
  )
  conferir(guardados.includes(pedidoId), 'navegador guardou o id do pedido sozinho')

  // ------------------------------------------- 3. o pedido aparece
  console.log('\n3) Histórico no mesmo aparelho')
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

  // ------------------------------------------- 4. cozinha mexe no status
  console.log('\n4) Status muda na cozinha e reflete no histórico')
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

  await sql(`update public.pedidos set status = 'pronto' where id = '${pedidoId}';`)
  await painel.close()

  await pagina.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  conferir(
    await pagina.getByText(/Pronto/i).first().isVisible(),
    'histórico mostra o pedido já pronto'
  )

  // e quando termina, sai de "em andamento" e vira histórico
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

  // ------------------------------------------- 5. o teste que importa
  console.log('\n5) Aparelho de outra pessoa NÃO vê este pedido')
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

  // ------------------------------------------- 5b. login pelo WhatsApp
  console.log('\n5b) Entrar com o WhatsApp em OUTRO aparelho')
  const celularNovo = await navegador.newContext({ viewport: { width: 420, height: 900 } })
  const outro = await celularNovo.newPage()

  await outro.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await outro.waitForTimeout(1200)
  conferir(
    await outro.getByRole('link', { name: /Entrar com o WhatsApp/ }).isVisible(),
    'aparelho novo recebe o convite para entrar'
  )
  await outro.screenshot({ path: `${TIROS}/mp-04-convite-login.png`, fullPage: true })

  await outro.getByRole('link', { name: /Entrar com o WhatsApp/ }).click()
  await outro.waitForURL('**/entrar')
  await outro.waitForTimeout(600)

  // telefone errado primeiro: o formulario tem que reclamar, nao aceitar
  await outro.getByLabel('Seu WhatsApp').fill('123')
  await outro.getByRole('button', { name: /Receber código/ }).click()
  await outro.waitForTimeout(1500)
  conferir(
    await outro.getByText(/Confira o número/).isVisible(),
    'número curto demais é recusado'
  )

  await outro.getByLabel('Seu WhatsApp').fill('71988886666')
  await outro.getByRole('button', { name: /Receber código/ }).click()
  await outro.waitForTimeout(2500)
  conferir(
    await outro.getByLabel(/Código de 6 dígitos/).isVisible(),
    'tela pede o código de 6 dígitos'
  )
  await outro.screenshot({ path: `${TIROS}/mp-05-codigo.png`, fullPage: true })

  // o codigo real: em demonstracao aparece na tela; senao, lemos do banco
  let codigoReal = null
  const naTela = await outro
    .getByText(/Modo demonstração/)
    .isVisible()
    .catch(() => false)
  if (naTela) {
    const texto = await outro.getByText(/o código aparece aqui/).textContent()
    codigoReal = texto?.match(/(\d{6})/)?.[1] ?? null
    ok('modo demonstração mostra o código com aviso na tela')
  }

  // código errado não pode entrar
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
      'entrou e a tela mostra de quem é a conta'
    )
    conferir(
      await outro.getByText('Cocada baiana').first().isVisible(),
      'histórico do WhatsApp aparece no aparelho novo, sem ter pedido nele'
    )
    await outro.screenshot({ path: `${TIROS}/mp-06-logado.png`, fullPage: true })

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
    conferir(
      !reuso.url().includes('/meus-pedidos'),
      'código já usado não entra de novo'
    )
    await terceiro.close()

    // checkout ja vem preenchido para quem entrou
    await outro.goto(BASE, { waitUntil: 'networkidle' })
    await outro.getByRole('button', { name: /é para viagem/i }).click()
    await outro.waitForTimeout(1500)
    await outro.getByRole('button', { name: /Cocada baiana/ }).first().click()
    await outro.waitForTimeout(400)
    await outro.getByRole('button', { name: /^Adicionar/ }).click()
    await outro.waitForTimeout(500)
    await outro.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
    await outro.waitForTimeout(1200)
    const nomePreenchido = await outro.getByLabel('Nome').inputValue()
    conferir(
      nomePreenchido === 'Cliente Historico',
      `checkout já vem com o nome de quem entrou ("${nomePreenchido}")`
    )

    // ------------------------------------ continuar logado (o ponto do iFood)
    console.log('\n5c) A sessão não pede senha de novo')
    const biscoito = (await celularNovo.cookies()).find((c) => c.name === 'bv_cliente')
    conferir(Boolean(biscoito), 'sessão vive num cookie')
    conferir(biscoito?.httpOnly === true, 'cookie é httpOnly (JavaScript da página não lê)')
    const diasDeCookie = (biscoito.expires * 1000 - Date.now()) / 86400000
    conferir(
      diasDeCookie > 300,
      `cookie fica no aparelho por ${Math.round(diasDeCookie)} dias (não some ao fechar o navegador)`
    )

    // fechar e reabrir o navegador não pode deslogar
    const paginaNova = await celularNovo.newPage()
    await paginaNova.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
    await paginaNova.waitForTimeout(1500)
    conferir(
      await paginaNova.getByText(/Entrou como|Entrou com/).isVisible(),
      'abrir de novo mais tarde continua logado'
    )
    await paginaNova.close()

    // janela deslizante: quem usa nunca vence
    const antes = await sql(
      `select expira_em from public.sessoes_cliente order by criado_em desc limit 1;`
    )
    await sql(
      `update public.sessoes_cliente set ultimo_acesso = now() - interval '2 days',
       expira_em = now() + interval '30 days';`
    )
    await outro.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
    await outro.waitForTimeout(1800)
    const depois = await sql(
      `select expira_em from public.sessoes_cliente order by criado_em desc limit 1;`
    )
    const venceEm = (novo) =>
      (new Date(novo?.[0]?.expira_em ?? 0).getTime() - Date.now()) / 86400000
    conferir(
      venceEm(depois) > 80,
      `visitar empurra o vencimento de volta para ${Math.round(venceEm(depois))} dias`
    )
    void antes

    // ------------------------------------ 5d. link mágico do WhatsApp
    console.log('\n5d) Link mágico que vem na confirmação')
    const tokenBom = 'token-de-teste-' + pedidoId.slice(0, 8)
    const hashBom = createHash('sha256').update(tokenBom).digest('hex')
    await sql(
      `insert into public.codigos_acesso (telefone, tipo, codigo_hash, expira_em)
       values ('71988886666', 'link', '${hashBom}', now() + interval '30 days');`
    )

    const celularDoLink = await navegador.newContext({ viewport: { width: 420, height: 900 } })
    const comLink = await celularDoLink.newPage()

    await comLink.goto(`${BASE}/entrar/link?t=naoexiste`, { waitUntil: 'networkidle' })
    await comLink.waitForTimeout(600)
    conferir(await comLink.getByText('Link vencido').isVisible(), 'token inventado não entra')

    // o WhatsApp abre o link sozinho para montar a previa; isso NAO pode gastar
    await comLink.goto(`${BASE}/entrar/link?t=${tokenBom}`, { waitUntil: 'networkidle' })
    await comLink.waitForTimeout(600)
    await comLink.goto(`${BASE}/entrar/link?t=${tokenBom}`, { waitUntil: 'networkidle' })
    await comLink.waitForTimeout(600)
    conferir(
      await comLink.getByText('É você mesmo?').isVisible(),
      'só abrir o link não gasta o token (robô de prévia não estraga)'
    )
    conferir(
      await comLink.getByText(/\(71\) 98888-6666/).isVisible(),
      'a tela diz de qual WhatsApp é a conta antes de entrar'
    )
    await comLink.screenshot({ path: `${TIROS}/mp-07-link-magico.png`, fullPage: true })

    await comLink.getByRole('button', { name: /Sim, entrar/ }).click()
    await comLink.waitForURL('**/meus-pedidos', { timeout: 20000 })
    await comLink.waitForTimeout(1800)
    conferir(
      await comLink.getByText(/Entrou como|Entrou com/).isVisible(),
      'um toque no link entra na conta, sem digitar nada'
    )
    conferir(
      await comLink.getByText('Cocada baiana').first().isVisible(),
      'histórico aparece direto pelo link'
    )

    await comLink.goto(`${BASE}/entrar/link?t=${tokenBom}`, { waitUntil: 'networkidle' })
    await comLink.waitForTimeout(800)
    conferir(
      await comLink.getByText('Link vencido').isVisible(),
      'link mágico serve uma vez só'
    )
    await celularDoLink.close()

    // sair de verdade: a sessão morre no banco, não só no navegador
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

  // ------------------------------------------- 6. como chegar na tela
  console.log('\n6) Caminho até a tela')
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
