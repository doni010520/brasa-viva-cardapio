/**
 * Apaga os pedidos de teste e zera os contadores, para o restaurante
 * começar do zero. Não toca no cardápio.
 *
 * Uso:  node scripts/limpar-testes.mjs
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

const antes = await sql('select count(*)::int as n from public.pedidos;')
console.log(`Pedidos no banco antes: ${antes[0].n}`)

// pedido_itens e pedido_eventos somem junto pelo cascade
await sql('delete from public.pedidos;')
await sql("alter sequence public.pedido_numero_seq restart with 1;")
await sql('update public.cupons set usos = 0;')
await sql('update public.produtos set disponivel = true;')

const depois = await sql(`
  select (select count(*)::int from public.pedidos)       as pedidos,
         (select count(*)::int from public.pedido_itens)  as itens,
         (select count(*)::int from public.pedido_eventos) as eventos,
         (select coalesce(sum(usos),0)::int from public.cupons) as usos_cupom,
         (select count(*)::int from public.produtos)      as produtos_no_cardapio;
`)
console.table(depois)
console.log('Pronto. O próximo pedido de verdade será o #001.')
