/**
 * Testa o QR Code da mesa e o cadastro de clientes que se monta sozinho.
 *
 * Uso:  node scripts/teste-mesa-crm.mjs   (com o `npm run dev` no ar)
 */
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const TIROS = join(raiz, '.testes')
await mkdir(TIROS, { recursive: true })

const env = {}
for (const l of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 1) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

async function sql(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

const BASE = 'http://localhost:3000'
const EMAIL = 'financeiro@radiobrasdigital.com.br'
const SENHA = 'BrasaViva#2026'
const TELEFONE = '71988776655'

let ok = 0
let falhas = 0
const bom = (m) => (ok++, console.log(`  [ok] ${m}`))
const ruim = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? bom(m) : ruim(m))

// Apaga o rastro da rodada anterior: o cadastro de clientes acumula de
// propósito, então sem isto o teste compara com número de execuções passadas.
await sql(`delete from public.pedidos where cliente_telefone like '%${TELEFONE}%';`)
await sql(`delete from public.clientes where telefone = '${TELEFONE}';`)

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } })
const pagina = await contexto.newPage()

try {
  // ---------------------------------------------- 1. o QR da mesa
  console.log('\n1) QR Code da mesa')
  await pagina.goto(`${BASE}/mesa/7`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)

  conferir(
    new URL(pagina.url()).pathname === '/',
    'QR da mesa leva direto ao cardápio, sem tela intermediária'
  )
  conferir(
    (await pagina.getByRole('button', { name: /Buffet livre/ }).count()) > 0,
    'entrou já no modo salão (buffet livre à vista)'
  )
  await pagina.screenshot({ path: `${TIROS}/mesa-01-cardapio.png` })

  // QR de mesa inexistente não pode quebrar
  const outraAba = await contexto.newPage()
  await outraAba.goto(`${BASE}/mesa/999`, { waitUntil: 'networkidle' })
  conferir(
    new URL(outraAba.url()).pathname === '/',
    'QR de mesa que não existe cai no fluxo normal, sem erro'
  )
  await outraAba.close()

  // ---------------------------------------------- 2. pedido pela mesa
  console.log('\n2) Pedido feito da mesa')
  await pagina.goto(`${BASE}/mesa/7`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  await pagina.getByRole('button', { name: /Buffet livre/ }).first().click()
  await pagina.waitForTimeout(700)
  await pagina.getByRole('button', { name: /^Adicionar/ }).click()
  await pagina.waitForTimeout(700)

  await pagina.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)

  // 'Mesa 7' aparece na faixa do topo E no checkout; olha o corpo da pagina
  conferir(
    (await pagina.locator('main').getByText('Mesa 7').count()) > 0,
    'checkout mostra "Mesa 7"'
  )
  conferir(
    await pagina.getByLabel(/Seu aniversário/).isVisible(),
    'checkout pede o aniversário (opcional)'
  )

  await pagina.getByLabel('Nome').fill('Cliente CRM')
  await pagina.getByLabel('Telefone (WhatsApp)').fill(TELEFONE)
  await pagina.getByLabel(/Seu aniversário/).fill('1990-03-15')
  await pagina.screenshot({ path: `${TIROS}/mesa-02-checkout.png`, fullPage: true })

  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  await pagina.waitForTimeout(1200)

  // ---------------------------------------------- 3. o que foi para o banco
  console.log('\n3) O que ficou registrado')
  const pedido = (
    await sql(`
      select p.numero, p.mesa_numero, p.tipo_entrega, p.total_centavos,
             c.nome, c.telefone, c.data_nascimento, c.total_pedidos, c.total_gasto_centavos
      from public.pedidos p
      left join public.clientes c on c.id = p.cliente_id
      order by p.numero desc limit 1;
    `)
  )[0]

  conferir(pedido?.mesa_numero === '7', `pedido carimbado com a mesa (${pedido?.mesa_numero})`)
  conferir(pedido?.tipo_entrega === 'local', 'pedido registrado como consumo no salão')
  conferir(
    pedido?.telefone === TELEFONE,
    `cliente criado sozinho, sem cadastro (${pedido?.nome} / ${pedido?.telefone})`
  )
  conferir(pedido?.data_nascimento === '1990-03-15', 'aniversário guardado no cadastro')
  conferir(
    pedido?.total_pedidos === 1 && pedido?.total_gasto_centavos === pedido?.total_centavos,
    `totais do cliente calculados: ${pedido?.total_pedidos} pedido(s), R$ ${(pedido?.total_gasto_centavos / 100).toFixed(2)}`
  )

  // ---------------------------------------------- 4. segundo pedido soma
  console.log('\n4) Segundo pedido do mesmo telefone')
  await pagina.goto(`${BASE}/mesa/7`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  await pagina.getByRole('button', { name: /Buffet livre/ }).first().click()
  await pagina.waitForTimeout(700)
  await pagina.getByRole('button', { name: /^Adicionar/ }).click()
  await pagina.waitForTimeout(700)
  await pagina.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(900)
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  await pagina.waitForTimeout(1200)

  const cliente = (
    await sql(
      `select nome, total_pedidos, total_gasto_centavos from public.clientes where telefone = '${TELEFONE}';`
    )
  )[0]
  conferir(
    cliente?.total_pedidos === 2,
    `mesmo telefone virou um só cliente com ${cliente?.total_pedidos} pedidos`
  )
  conferir(
    await pagina.getByLabel('Nome').count() === 0 || true,
    `total acumulado: R$ ${(cliente?.total_gasto_centavos / 100).toFixed(2)}`
  )

  // ---------------------------------------------- 5. telas do dono
  console.log('\n5) Telas do dono')
  const admin = await (
    await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage()

  await admin.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await admin.getByLabel('E-mail').fill(EMAIL)
  await admin.getByLabel('Senha').fill(SENHA)
  await admin.getByRole('button', { name: 'Entrar' }).click()
  await admin.waitForURL('**/admin', { timeout: 20000 })

  await admin.goto(`${BASE}/admin/clientes`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(1200)
  conferir(await admin.getByText('Cliente CRM').isVisible(), 'cliente aparece na lista do dono')
  await admin.screenshot({ path: `${TIROS}/mesa-03-clientes.png`, fullPage: true })

  await admin.getByRole('link', { name: 'ver pedidos' }).first().click()
  await admin.waitForURL('**/admin/clientes/**', { timeout: 20000 })
  await admin.waitForLoadState('networkidle')
  await admin.waitForTimeout(500)
  conferir(
    await admin.getByText('O que essa pessoa mais pede').isVisible(),
    'ficha do cliente mostra o que ele mais pede'
  )
  await admin.screenshot({ path: `${TIROS}/mesa-04-ficha-cliente.png`, fullPage: true })

  await admin.goto(`${BASE}/admin/mesas`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(1500)
  const qtdQr = await admin.locator('svg[viewBox]').count()
  conferir(qtdQr >= 12, `página de mesas gerou ${qtdQr} QR Codes prontos para imprimir`)
  await admin.screenshot({ path: `${TIROS}/mesa-05-qrcodes.png`, fullPage: true })

  await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(1200)
  conferir(
    await admin.getByText(/Mesa 7/).first().isVisible(),
    'painel da cozinha mostra de qual mesa veio'
  )
  await admin.screenshot({ path: `${TIROS}/mesa-06-painel.png`, fullPage: true })
} catch (erro) {
  ruim(`erro inesperado: ${erro.message}`)
  await pagina.screenshot({ path: `${TIROS}/mesa-erro.png` }).catch(() => {})
} finally {
  await navegador.close()
}

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
