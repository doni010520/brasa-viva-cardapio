/**
 * Confere a função de relatório: cria vendas conhecidas, chama a função e
 * compara com a conta feita na mão.
 *
 * Uso:  node scripts/conferir-relatorio.mjs
 */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
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
  if (!r.ok) throw new Error(t.slice(0, 800))
  return JSON.parse(t)
}

let ok = 0
let falhas = 0
const conferir = (c, m) => (c ? (ok++, console.log(`  [ok] ${m}`)) : (falhas++, console.log(`  [FALHA] ${m}`)))
const real = (c) => `R$ ${(c / 100).toFixed(2)}`

console.log('\nMontando vendas de teste...')
await sql('delete from public.pedidos;')
await sql("delete from public.clientes where telefone like '9199%';")

// 3 vendas boas + 1 cancelada + 1 sem pagar (as duas últimas NÃO podem contar)
const produto = (
  await sql("select id, nome from public.produtos where nome = 'Churrasco misto' limit 1;")
)[0]

// o pedido de entrega precisa de rua e número: o banco tem uma trava para isso
await sql(`
  insert into public.pedidos
    (cliente_nome, cliente_telefone, tipo_entrega, forma_pagamento, status,
     status_pagamento, subtotal_centavos, desconto_centavos, entrega_taxa_centavos,
     total_centavos, cupom_codigo, mesa_numero,
     endereco_rua, endereco_numero, endereco_bairro)
  values
    ('Ana',   '91991110001', 'local',    'local',  'retirado', 'pago',    10000, 0,    0,   10000, null,      '5',  null, null, null),
    ('Bruno', '91991110002', 'retirada', 'local',  'retirado', 'pago',    20000, 2000, 0,   18000, 'BRASA10', null, null, null, null),
    ('Ana',   '91991110001', 'entrega',  'online', 'retirado', 'pago',    30000, 0,    700, 30700, null,      null, 'Rua das Flores', '10', 'Centro'),
    ('Caio',  '91991110003', 'retirada', 'local',  'cancelado','pendente', 5000, 0,    0,    5000, null,      null, null, null, null),
    ('Duda',  '91991110004', 'retirada', 'online', 'aguardando_pagamento', 'pendente', 9000, 0, 0, 9000, null, null, null, null, null);
`)

await sql(`
  insert into public.pedido_itens (pedido_id, produto_id, produto_nome, quantidade,
                                   preco_unit_centavos, total_centavos)
  select p.id, '${produto.id}', '${produto.nome}', 2, 5000, 10000
    from public.pedidos p where p.cliente_nome in ('Ana','Bruno');
`)

// Compra antiga do Bruno, fora do período: ele tem de aparecer como
// RECORRENTE, e a Ana como nova. Sem isto o teste nunca exercita a diferença.
await sql(`
  insert into public.pedidos
    (cliente_nome, cliente_telefone, tipo_entrega, forma_pagamento, status,
     status_pagamento, subtotal_centavos, total_centavos, criado_em)
  values
    ('Bruno', '91991110002', 'retirada', 'local', 'retirado', 'pago',
     4000, 4000, now() - interval '60 days');
`)

const r = (
  await sql(
    "select public.relatorio_vendas(now() - interval '1 day', now() + interval '1 day') as r;"
  )
)[0].r

console.log('\n1) Resumo')
conferir(r.resumo.pedidos === 3, `conta só as 3 vendas boas (veio ${r.resumo.pedidos})`)
conferir(
  r.resumo.faturamento === 58700,
  `faturamento ${real(r.resumo.faturamento)} (esperado ${real(58700)})`
)
conferir(
  r.resumo.ticket_medio === Math.round(58700 / 3),
  `ticket médio ${real(r.resumo.ticket_medio)}`
)
conferir(r.resumo.descontos === 2000, `descontos ${real(r.resumo.descontos)}`)
conferir(r.resumo.taxas_entrega === 700, `taxas de entrega ${real(r.resumo.taxas_entrega)}`)
conferir(r.resumo.cancelados === 1, `cancelados contados à parte: ${r.resumo.cancelados}`)
conferir(r.resumo.nao_pagos === 1, `não pagos contados à parte: ${r.resumo.nao_pagos}`)
conferir(r.resumo.clientes === 2, `clientes distintos no periodo: ${r.resumo.clientes} (Ana comprou 2x, conta 1)`)

console.log('\n2) Quebras')
const tipos = Object.fromEntries(r.por_tipo.map((t) => [t.tipo, t]))
conferir(tipos.local?.total === 10000, `salão: ${real(tipos.local?.total ?? 0)}`)
conferir(tipos.retirada?.total === 18000, `retirada: ${real(tipos.retirada?.total ?? 0)}`)
conferir(tipos.entrega?.total === 30700, `entrega: ${real(tipos.entrega?.total ?? 0)}`)

conferir(r.cupons.length === 1 && r.cupons[0].desconto === 2000, 'cupom com o desconto certo')
conferir(
  r.bairros.length === 1 && r.bairros[0].bairro === 'Centro',
  'faturamento por bairro da entrega'
)
conferir(r.mesas.length === 1 && r.mesas[0].mesa === '5', 'faturamento por mesa')
conferir(r.produtos[0]?.quantidade === 6, `unidades vendidas somadas: ${r.produtos[0]?.quantidade}`)
conferir(r.categorias.length > 0, `categorias: ${r.categorias.map((c) => c.nome).join(', ')}`)
conferir(r.por_hora.length > 0, `movimento por hora do dia: ${r.por_hora.length} faixa(s)`)
conferir(r.por_dia.length > 0, `vendas por dia: ${r.por_dia.length} dia(s)`)
conferir(
  r.clientes.novos === 1 && r.clientes.recorrentes === 1,
  `separa quem e novo de quem voltou: ${r.clientes.novos} novo(s), ${r.clientes.recorrentes} recorrente(s)`
)

// desempenho com o banco cheio
console.log('\n3) Velocidade')
const t0 = Date.now()
await sql("select public.relatorio_vendas(now() - interval '365 days', now()) as r;")
const ms = Date.now() - t0
conferir(ms < 4000, `relatório de 1 ano respondeu em ${ms}ms`)

await sql('delete from public.pedidos;')
await sql("delete from public.clientes where telefone like '9199%';")

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
