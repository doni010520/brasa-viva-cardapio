/**
 * Testa a tela de relatórios com vendas plantadas, e a planilha exportada.
 *
 * Uso:  node scripts/teste-relatorios.mjs   (com o `npm run dev` no ar)
 */
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'
import { limparTudoComPermissao } from './limpeza.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const TIROS = join(raiz, '.testes')
await mkdir(TIROS, { recursive: true })

const env = {}
for (const l of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
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
  if (!r.ok) throw new Error(t.slice(0, 600))
  return JSON.parse(t)
}

const BASE = 'http://localhost:3000'
const EMAIL = EMAIL_ADMIN
const SENHA = SENHA_ADMIN

let ok = 0
let falhas = 0
const conferir = (c, m) =>
  c ? (ok++, console.log(`  [ok] ${m}`)) : (falhas++, console.log(`  [FALHA] ${m}`))

// ------------------------------------------------- planta 30 dias de vendas
console.log('\nPlantando vendas espalhadas nos últimos 30 dias...')
await limparTudoComPermissao(sql, 'teste-relatorios')
await sql("delete from public.clientes where telefone like '7197%';")

const produtos = await sql('select id, nome, preco_centavos from public.produtos limit 6;')

let sqlInsert = ''
for (let i = 0; i < 40; i++) {
  const dias = i % 28
  const hora = 11 + (i % 10)
  const tipo = ['local', 'retirada', 'entrega'][i % 3]
  const total = 3000 + (i % 7) * 1500
  const telefone = `7197000${String(1000 + (i % 12)).slice(-4)}`
  const endereco =
    tipo === 'entrega'
      ? `'Rua Teste', '${100 + i}', 'Centro'`
      : 'null, null, null'
  const mesa = tipo === 'local' ? `'${(i % 8) + 1}'` : 'null'

  sqlInsert += `
    insert into public.pedidos
      (cliente_nome, cliente_telefone, tipo_entrega, forma_pagamento, status,
       status_pagamento, subtotal_centavos, total_centavos, entrega_taxa_centavos,
       mesa_numero, endereco_rua, endereco_numero, endereco_bairro, criado_em)
    values ('Cliente ${i % 12}', '${telefone}', '${tipo}',
            '${i % 2 === 0 ? 'local' : 'online'}', 'retirado',
            '${i % 2 === 0 ? 'pendente' : 'pago'}',
            ${total}, ${total}, ${tipo === 'entrega' ? 700 : 0},
            ${mesa}, ${endereco},
            (now() - interval '${dias} days')::date + interval '${hora} hours');
  `
}
await sql(sqlInsert)

// itens, para o ranking de produtos ter o que mostrar
for (const [indice, p] of produtos.entries()) {
  await sql(`
    insert into public.pedido_itens (pedido_id, produto_id, produto_nome, quantidade,
                                     preco_unit_centavos, total_centavos)
    select id, '${p.id}', '${p.nome}', ${indice + 1}, ${p.preco_centavos},
           ${p.preco_centavos * (indice + 1)}
      from public.pedidos
     where criado_em > now() - interval '30 days'
     limit ${10 - indice};
  `)
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
const pagina = await contexto.newPage()
const errosDeConsole = []
pagina.on('pageerror', (e) => errosDeConsole.push(String(e)))

try {
  await pagina.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('E-mail').fill(EMAIL)
  await pagina.getByLabel('Senha').fill(SENHA)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await pagina.waitForURL('**/admin', { timeout: 20000 })

  console.log('\n1) A tela abre e mostra os números')
  await pagina.goto(`${BASE}/admin/relatorios?periodo=30`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)

  const esperado = (
    await sql(
      // a janela precisa ser calculada no fuso da LOJA, igual ao app faz.
      // Em UTC, depois das 21h daqui ja e o dia seguinte, e a comparacao
      // pegava um periodo diferente do que a tela mostra.
      `select public.relatorio_vendas(
         (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '29 days')
           at time zone 'America/Sao_Paulo',
         (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day')
           at time zone 'America/Sao_Paulo'
       ) as r;`
    )
  )[0].r

  const faturamentoTela = await pagina
    .locator('text=/^R\\$/')
    .first()
    .textContent()

  conferir(
    await pagina.getByRole('heading', { name: 'Relatórios' }).isVisible(),
    'página abriu'
  )
  conferir(
    (faturamentoTela ?? '').replace(/\s/g, '') ===
      `R$${(esperado.resumo.faturamento / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.replace(/\s/g, ''),
    `faturamento na tela bate com o banco (${faturamentoTela?.trim()})`
  )

  for (const secao of [
    'Vendas por dia',
    'Movimento por hora',
    'Por dia da semana',
    'Produtos que mais vendem',
    'Por categoria',
    'Salão, retirada ou entrega',
    'Como pagaram',
    'Entregas por bairro',
    'Consumo por mesa',
    'Clientes do período',
  ]) {
    conferir(await pagina.getByRole('heading', { name: secao }).isVisible(), `seção "${secao}"`)
  }

  await pagina.screenshot({ path: `${TIROS}/relatorio-completo.png`, fullPage: true })

  console.log('\n2) Troca de período')
  await pagina.getByRole('link', { name: 'Hoje' }).click()
  await pagina.waitForURL('**/relatorios?periodo=hoje', { timeout: 15000 })
  await pagina.waitForTimeout(1200)
  const hoje = (
    await sql(
      `select public.relatorio_vendas(
         date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
         (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day')
           at time zone 'America/Sao_Paulo'
       ) as r;`
    )
  )[0].r
  const semVenda = hoje.resumo.pedidos === 0
  conferir(
    semVenda
      ? await pagina.getByText('Nenhuma venda neste período').isVisible()
      : await pagina.getByRole('heading', { name: 'Relatórios' }).isVisible(),
    semVenda ? 'período sem venda mostra aviso, não erro' : 'período de hoje carregou'
  )

  console.log('\n3) A planilha')
  const csv = await pagina.request.get(`${BASE}/admin/relatorios/csv?periodo=30`)
  conferir(csv.ok(), `download responde (HTTP ${csv.status()})`)
  conferir(
    (csv.headers()['content-disposition'] ?? '').includes('.csv'),
    'vem como arquivo para baixar'
  )

  const texto = await csv.text()
  conferir(texto.charCodeAt(0) === 0xfeff, 'tem BOM (Excel abre os acentos certos)')
  conferir(texto.includes(';'), 'usa ponto-e-vírgula (padrão do Excel em português)')
  for (const secao of ['RESUMO', 'VENDAS POR DIA', 'MOVIMENTO POR HORA', 'PRODUTOS']) {
    conferir(texto.includes(secao), `planilha traz a seção ${secao}`)
  }
  conferir(
    texto.includes((esperado.resumo.faturamento / 100).toFixed(2).replace('.', ',')),
    'faturamento na planilha usa vírgula decimal'
  )

  console.log('\n4) Quem não é do restaurante não baixa')
  // maxRedirects: 0 de propósito — seguindo o redirecionamento a resposta
  // vira a página de login com status 200, e o teste passaria achando que
  // está tudo certo mesmo se houvesse vazamento.
  const anonimo = await (await navegador.newContext()).request.get(
    `${BASE}/admin/relatorios/csv?periodo=30`,
    { maxRedirects: 0 }
  )
  conferir(
    [301, 302, 303, 307, 308, 403].includes(anonimo.status()),
    `planilha barrada para quem não está logado (HTTP ${anonimo.status()})`
  )
  const corpoAnonimo = await anonimo.text()
  conferir(
    !corpoAnonimo.includes('RESUMO') && !corpoAnonimo.includes('Faturamento'),
    'nenhum número de venda no corpo da resposta'
  )
} catch (e) {
  falhas++
  console.log(`  [FALHA] erro inesperado: ${e.message}`)
  await pagina.screenshot({ path: `${TIROS}/relatorio-erro.png`, fullPage: true }).catch(() => {})
} finally {
  await navegador.close()
}

await limparTudoComPermissao(sql, 'teste-relatorios')
await sql("delete from public.clientes where telefone like '7197%';")

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
if (errosDeConsole.length) {
  console.log(`  erros de console: ${errosDeConsole.length}`)
  for (const e of errosDeConsole.slice(0, 4)) console.log(`   - ${e.slice(0, 150)}`)
}
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
