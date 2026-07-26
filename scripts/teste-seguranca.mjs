/**
 * Testa as defesas que o sistema promete:
 *   1) a chave pública (anon) só enxerga o cardápio — nunca pedidos ou cupons
 *   2) ninguém consegue alterar preço pelo navegador
 *   3) o servidor recusa pedido forjado (opção de outro produto, item fora do cardápio)
 *
 * Uso:  node scripts/teste-seguranca.mjs   (com o `npm run dev` no ar)
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const linha of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const l = linha.trim()
  if (!l || l.startsWith('#')) continue
  const i = l.indexOf('=')
  if (i < 1) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim()
}

const BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP = 'http://localhost:3000'

let ok = 0
let falhas = 0
const bom = (m) => (ok++, console.log(`  [ok] ${m}`))
const ruim = (m) => (falhas++, console.log(`  [FALHA] ${m}`))

async function comoAnonimo(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  })
  let corpo
  try {
    corpo = JSON.parse(await r.text())
  } catch {
    corpo = null
  }
  return { status: r.status, corpo }
}

console.log('\n=== 1) O que a chave pública consegue ver ===')

const cardapio = await comoAnonimo('produtos?select=nome,preco_centavos&limit=3')
Array.isArray(cardapio.corpo) && cardapio.corpo.length > 0
  ? bom('cardápio é legível publicamente (esperado)')
  : ruim('cardápio deveria ser público')

const pedidos = await comoAnonimo('pedidos?select=cliente_nome,cliente_telefone')
Array.isArray(pedidos.corpo) && pedidos.corpo.length === 0
  ? bom('pedidos NÃO vazam (nome e telefone dos clientes protegidos)')
  : ruim(`pedidos vazaram: ${JSON.stringify(pedidos.corpo)?.slice(0, 200)}`)

const itens = await comoAnonimo('pedido_itens?select=produto_nome')
Array.isArray(itens.corpo) && itens.corpo.length === 0
  ? bom('itens de pedido NÃO vazam')
  : ruim('itens de pedido vazaram')

const cupons = await comoAnonimo('cupons?select=codigo,valor')
Array.isArray(cupons.corpo) && cupons.corpo.length === 0
  ? bom('cupons NÃO vazam (ninguém descobre código de desconto)')
  : ruim(`cupons vazaram: ${JSON.stringify(cupons.corpo)?.slice(0, 200)}`)

const admins = await comoAnonimo('admins?select=email')
Array.isArray(admins.corpo) && admins.corpo.length === 0
  ? bom('lista de administradores NÃO vaza')
  : ruim('e-mails de administradores vazaram')

// O cofre do login do cliente. Se um destes vazar, qualquer um entra como
// qualquer um e vê nome, endereço e histórico de compras de quem quiser.
const codigos = await comoAnonimo('codigos_acesso?select=telefone,codigo_hash')
Array.isArray(codigos.corpo) && codigos.corpo.length === 0
  ? bom('códigos de acesso NÃO vazam')
  : ruim(`códigos de acesso vazaram: ${JSON.stringify(codigos.corpo)?.slice(0, 200)}`)

const sessoes = await comoAnonimo('sessoes_cliente?select=token_hash,telefone')
Array.isArray(sessoes.corpo) && sessoes.corpo.length === 0
  ? bom('sessões de cliente NÃO vazam')
  : ruim(`sessões de cliente vazaram: ${JSON.stringify(sessoes.corpo)?.slice(0, 200)}`)

const clientes = await comoAnonimo('clientes?select=nome,telefone')
Array.isArray(clientes.corpo) && clientes.corpo.length === 0
  ? bom('cadastro de clientes NÃO vaza')
  : ruim(`cadastro de clientes vazou: ${JSON.stringify(clientes.corpo)?.slice(0, 200)}`)

console.log('\n=== 2) O que a chave pública consegue alterar ===')

const idProduto = (await comoAnonimo('produtos?select=id&limit=1')).corpo?.[0]?.id

const tentaBaixarPreco = await comoAnonimo(`produtos?id=eq.${idProduto}`, {
  method: 'PATCH',
  body: JSON.stringify({ preco_centavos: 1 }),
})
const precoDepois = (await comoAnonimo(`produtos?select=preco_centavos&id=eq.${idProduto}`))
  .corpo?.[0]?.preco_centavos
precoDepois !== 1
  ? bom(`não dá para baixar preço pelo navegador (segue R$ ${(precoDepois / 100).toFixed(2)})`)
  : ruim('PREÇO FOI ALTERADO pela chave pública!')

const tentaCriarPedido = await comoAnonimo('pedidos', {
  method: 'POST',
  body: JSON.stringify({
    cliente_nome: 'Invasor',
    cliente_telefone: '71999999999',
    forma_pagamento: 'local',
    total_centavos: 1,
  }),
})
tentaCriarPedido.status >= 400
  ? bom(`não dá para inserir pedido direto no banco (HTTP ${tentaCriarPedido.status})`)
  : ruim('pedido foi inserido direto no banco pela chave pública!')

const tentaCupom = await comoAnonimo('cupons', {
  method: 'POST',
  body: JSON.stringify({ codigo: 'HACK100', tipo: 'percentual', valor: 100 }),
})
tentaCupom.status >= 400
  ? bom(`não dá para criar cupom de 100% (HTTP ${tentaCupom.status})`)
  : ruim('CUPOM DE 100% FOI CRIADO pela chave pública!')

console.log('\n=== 3) Pedido forjado pelo carrinho (localStorage) ===')

const navegador = await chromium.launch()
const contexto = await navegador.newContext()
const pagina = await contexto.newPage()

try {
  await pagina.goto(APP, { waitUntil: 'networkidle' })
  // o site pergunta onde a pessoa vai comer antes de mostrar o cardápio
  const escolha = pagina.getByRole('button', { name: /é para viagem/i })
  if (await escolha.count()) {
    await escolha.first().click()
    await pagina.waitForTimeout(1500)
  }

  // pega ids reais: um produto barato e uma opção que pertence a OUTRO produto
  const dados = await (async () => {
    const p = (
      await comoAnonimo(
        'produtos?select=id,nome,preco_centavos&nome=eq.Cocada%20baiana&limit=1'
      )
    ).corpo[0]
    const opcaoDeOutro = (
      await comoAnonimo('opcoes?select=id,nome&nome=eq.Bacon&limit=1')
    ).corpo?.[0] ??
      (await comoAnonimo('opcoes?select=id,nome&limit=1')).corpo[0]
    return { p, opcaoDeOutro }
  })()

  // carrinho forjado: preço R$ 0,01 e uma opção que não é deste produto
  await pagina.evaluate(
    ({ produto, opcao }) => {
      localStorage.setItem(
        'cardapio:carrinho:v1',
        JSON.stringify([
          {
            linhaId: 'forjado',
            produtoId: produto.id,
            nome: produto.nome,
            imagemUrl: null,
            precoBaseCentavos: 1, // <<< preço adulterado
            opcoes: [
              { id: opcao.id, grupo: 'x', nome: opcao.nome, preco_extra_centavos: 0 },
            ],
            observacao: '',
            quantidade: 1,
          },
        ])
      )
    },
    { produto: dados.p, opcao: dados.opcaoDeOutro }
  )

  await pagina.goto(`${APP}/checkout`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)
  await pagina.getByLabel('Nome').fill('Invasor')
  await pagina.getByLabel('Telefone (WhatsApp)').fill('71999999999')
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForTimeout(3000)

  const virouPedido = pagina.url().includes('/pedido/')
  const mensagem = await pagina
    .locator('.bg-marca-50')
    .first()
    .textContent()
    .catch(() => null)

  if (virouPedido) {
    // se passou, o preço tem que ter sido corrigido pelo servidor
    const numero = await pagina.locator('.text-6xl').textContent()
    console.log(`     virou pedido #${numero?.trim()} — conferindo o valor gravado...`)
    ruim('pedido com opção inválida foi aceito (ver valor no banco)')
  } else {
    bom(`servidor recusou o pedido forjado: "${(mensagem ?? '').trim().slice(0, 90)}"`)
  }

  // agora só o preço adulterado, sem opção inválida
  await pagina.evaluate((produto) => {
    localStorage.setItem(
      'cardapio:carrinho:v1',
      JSON.stringify([
        {
          linhaId: 'forjado2',
          produtoId: produto.id,
          nome: produto.nome,
          imagemUrl: null,
          precoBaseCentavos: 1, // <<< R$ 0,01
          opcoes: [],
          observacao: '',
          quantidade: 1,
        },
      ])
    )
  }, dados.p)

  await pagina.goto(`${APP}/checkout`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)
  const totalNaTela = await pagina.locator('text=/R\\$\\s*0,01/').count()
  console.log(`     carrinho adulterado mostra R$ 0,01 na tela do cliente: ${totalNaTela > 0}`)

  await pagina.getByLabel('Nome').fill('Invasor')
  await pagina.getByLabel('Telefone (WhatsApp)').fill('71999999999')
  await pagina.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await pagina.waitForURL('**/pedido/**', { timeout: 20000 })
  await pagina.waitForTimeout(800)

  // a URL pode terminar em /obrigado; queremos só o id
  const idPedido = pagina.url().split('/pedido/')[1].split('/')[0]
  const gravado = await fetch(
    `https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `select total_centavos from public.pedidos where id = '${idPedido}';`,
      }),
    }
  ).then((r) => r.json())

  const total = gravado[0]?.total_centavos
  total === dados.p.preco_centavos
    ? bom(
        `preço adulterado foi IGNORADO: cliente tentou R$ 0,01, servidor cobrou R$ ${(total / 100).toFixed(2)}`
      )
    : ruim(`servidor gravou R$ ${(total / 100).toFixed(2)} (esperado R$ ${(dados.p.preco_centavos / 100).toFixed(2)})`)

  // limpa o pedido de teste
  await fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `delete from public.pedidos where cliente_nome = 'Invasor';`,
    }),
  })
} catch (erro) {
  ruim(`erro no teste: ${erro.message}`)
} finally {
  await navegador.close()
}

console.log('\n============================================')
console.log(`  ${ok} defesas confirmadas, ${falhas} falhas`)
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
