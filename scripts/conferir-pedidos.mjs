/**
 * Confere, direto no banco, se as contas dos pedidos fecham.
 * Uso:  node scripts/conferir-pedidos.mjs
 */
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

const real = (c) => (c / 100).toFixed(2).replace('.', ',')

console.log('=== Pedidos gravados ===')
const pedidos = await sql(`
  select numero, cliente_nome, tipo_entrega, forma_pagamento, status, status_pagamento,
         subtotal_centavos, desconto_centavos, entrega_taxa_centavos, total_centavos, cupom_codigo
  from public.pedidos order by numero;
`)

for (const p of pedidos) {
  const somaItens = (
    await sql(
      `select coalesce(sum(total_centavos),0)::int as s from public.pedido_itens
       where pedido_id = (select id from public.pedidos where numero = ${p.numero});`
    )
  )[0].s

  const totalEsperado =
    p.subtotal_centavos - p.desconto_centavos + p.entrega_taxa_centavos

  const subtotalBate = somaItens === p.subtotal_centavos
  const totalBate = totalEsperado === p.total_centavos

  console.log(`
#${String(p.numero).padStart(3, '0')} — ${p.cliente_nome} (${p.tipo_entrega}, ${p.forma_pagamento}, ${p.status})
  soma dos itens .... R$ ${real(somaItens)}
  subtotal gravado .. R$ ${real(p.subtotal_centavos)}   ${subtotalBate ? 'OK' : '<<< DIVERGENTE'}
  desconto${p.cupom_codigo ? ` (${p.cupom_codigo})` : ''} ......... R$ ${real(p.desconto_centavos)}
  taxa de entrega ... R$ ${real(p.entrega_taxa_centavos)}
  total gravado ..... R$ ${real(p.total_centavos)}   ${totalBate ? 'OK' : '<<< DIVERGENTE'}`)
}

console.log('\n=== Itens do último pedido ===')
const itens = await sql(`
  select i.produto_nome, i.quantidade, i.preco_unit_centavos, i.total_centavos, i.opcoes
  from public.pedido_itens i
  join public.pedidos p on p.id = i.pedido_id
  where p.numero = (select max(numero) from public.pedidos);
`)
for (const i of itens) {
  const opcoes = (i.opcoes ?? []).map((o) => o.nome).join(', ')
  console.log(
    `  ${i.quantidade}x ${i.produto_nome} — unit R$ ${real(i.preco_unit_centavos)} — total R$ ${real(i.total_centavos)}${opcoes ? `\n      opções: ${opcoes}` : ''}`
  )
}

console.log('\n=== Preço real do Churrasco misto no cardápio ===')
const catalogo = await sql(`
  select p.nome, p.preco_centavos, o.nome as opcao, o.preco_extra_centavos
  from public.produtos p
  left join public.grupos_opcoes g on g.produto_id = p.id
  left join public.opcoes o on o.grupo_id = g.id
  where p.nome = 'Churrasco misto' and (o.nome = 'Farofa extra' or o.nome is null);
`)
for (const c of catalogo) {
  console.log(
    `  ${c.nome}: R$ ${real(c.preco_centavos)}${c.opcao ? ` + ${c.opcao} R$ ${real(c.preco_extra_centavos)}` : ''}`
  )
}

console.log('\n=== Trilha de status do último pedido ===')
const eventos = await sql(`
  select e.de, e.para, e.origem, to_char(e.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora
  from public.pedido_eventos e
  join public.pedidos p on p.id = e.pedido_id
  where p.numero = (select max(numero) from public.pedidos)
  order by e.criado_em;
`)
console.table(eventos)

console.log('\n=== Uso do cupom ===')
console.table(await sql(`select codigo, tipo, valor, usos, usos_maximos from public.cupons;`))
