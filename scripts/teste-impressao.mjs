/**
 * Prova o caminho todo da impressão: pedido entra -> fila enche sozinha ->
 * agente pega -> comanda sai em ESC/POS -> fila esvazia.
 *
 * Roda o agente de verdade, no modo "arquivo", que grava o cupom em disco
 * em vez de mandar para a impressora. É o mesmo código que vai rodar no
 * restaurante — só muda para onde os bytes vão.
 *
 * Uso:  node scripts/teste-impressao.mjs   (com o `npm run dev` no ar)
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(raiz, '.testes', 'comandas')
await rm(SAIDA, { recursive: true, force: true })
await mkdir(SAIDA, { recursive: true })

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
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

const BASE = 'http://localhost:3000'
const TOKEN = env.TOKEN_IMPRESSAO

let ok = 0
let falhas = 0
const bom = (m) => (ok++, console.log(`  [ok] ${m}`))
const ruim = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? bom(m) : ruim(m))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------ limpa o terreno
await sql(`delete from public.pedidos;`)
await sql(`delete from public.impressoes;`)

console.log('\n1) Segurança da fila')
const semToken = await fetch(`${BASE}/api/impressao/fila`)
conferir(semToken.status === 401, `fila recusa quem não tem token (HTTP ${semToken.status})`)

const tokenErrado = await fetch(`${BASE}/api/impressao/fila`, {
  headers: { Authorization: 'Bearer token-errado-mas-do-mesmo-tamanho-aqui' },
})
conferir(tokenErrado.status === 401, `fila recusa token errado (HTTP ${tokenErrado.status})`)

// ------------------------------------------------ cria um pedido de verdade
console.log('\n2) Pedido entra e a fila enche sozinha')
const produto = (
  await sql(
    `select p.id, p.nome, p.preco_centavos from public.produtos p
      where p.nome = 'Churrasco misto' limit 1;`
  )
)[0]

const pedido = (
  await sql(`
    insert into public.pedidos
      (cliente_nome, cliente_telefone, tipo_entrega, mesa_numero, forma_pagamento,
       status, status_pagamento, subtotal_centavos, total_centavos, observacoes)
    values
      ('Maria de Fátima Conceição', '71988887777', 'local', '7', 'local',
       'recebido', 'pendente', ${produto.preco_centavos}, ${produto.preco_centavos},
       'Sem pimenta, por favor')
    returning id, numero;
  `)
)[0]

await sql(`
  insert into public.pedido_itens
    (pedido_id, produto_id, produto_nome, quantidade, preco_unit_centavos, total_centavos,
     opcoes, observacao)
  values
    ('${pedido.id}', '${produto.id}', '${produto.nome}', 2, ${produto.preco_centavos},
     ${produto.preco_centavos * 2},
     '[{"id":"x","grupo":"Ponto","nome":"Mal passado","preco_extra_centavos":0}]'::jsonb,
     'Carne bem mal passada');
`)

await espera(800)

const fila = await sql(
  `select status, via, tentativas from public.impressoes where pedido_id = '${pedido.id}';`
)
conferir(
  fila.length === 1 && fila[0].status === 'pendente',
  `comanda entrou na fila sozinha, sem ninguém pedir (${fila.length} via)`
)

// ------------------------------------------------------ roda o agente
console.log('\n3) O agente imprime')
await writeFile(
  join(raiz, 'agente-impressao', '.env'),
  [
    `URL_SISTEMA=${BASE}`,
    `TOKEN_IMPRESSAO=${TOKEN}`,
    'INTERVALO_SEGUNDOS=2',
    'IMPRESSORA_TIPO=arquivo',
    `PASTA_SAIDA=${SAIDA}`,
  ].join('\n')
)

const agente = spawn('node', [join(raiz, 'agente-impressao', 'agente.mjs')], {
  cwd: join(raiz, 'agente-impressao'),
})
let saidaAgente = ''
agente.stdout.on('data', (d) => (saidaAgente += d))
agente.stderr.on('data', (d) => (saidaAgente += d))

await espera(7000)
agente.kill()
await espera(500)

conferir(
  saidaAgente.includes(`Pedido #${String(pedido.numero).padStart(3, '0')} impresso`),
  `agente relatou a impressão do pedido #${String(pedido.numero).padStart(3, '0')}`
)

const arquivos = (await readdir(SAIDA)).filter((n) => n.endsWith('.bin'))
conferir(arquivos.length === 1, `comanda gravada (${arquivos.length} arquivo)`)

const depois = await sql(
  `select status, impresso_em from public.impressoes where pedido_id = '${pedido.id}';`
)
conferir(
  depois[0]?.status === 'impresso' && depois[0]?.impresso_em !== null,
  'fila marcou como impresso — não vai sair duas vezes'
)

// ------------------------------------------------ o cupom está correto?
console.log('\n4) O que saiu no papel')
const bytes = await readFile(join(SAIDA, arquivos[0]))
const texto = bytes.toString('latin1')

conferir(bytes[0] === 0x1b && bytes[1] === 0x40, 'cupom começa com o comando de inicializar')
conferir(texto.includes('CHURRASCARIA BRASA VIVA'), 'nome da casa no cabeçalho')
conferir(
  texto.includes(`#${String(pedido.numero).padStart(3, '0')}`),
  'número do pedido em destaque'
)
conferir(texto.includes('SALAO') && texto.includes('MESA 7'), 'destino e mesa impressos')
conferir(texto.includes('2x Churrasco misto'), 'item com a quantidade')
conferir(texto.includes('Mal passado'), 'opção escolhida')
conferir(texto.includes('CARNE BEM MAL PASSADA'), 'observação do item em maiúsculas')
conferir(texto.includes('SEM PIMENTA'), 'observação do pedido')
conferir(texto.includes('COBRAR NO BALCAO'), 'aviso de cobrança')
conferir(
  texto.includes('Maria de Fatima Conceicao'),
  'acentos convertidos para ASCII (impressora desconhecida)'
)
conferir(!/[À-ÿ]/.test(texto), 'nenhum acento cru que viraria lixo no papel')
conferir(
  /R\$ \d/.test(texto) && !/R\$[?\x80-\xff]/.test(texto),
  'valores saem como "R$ 98,00", sem lixo no lugar do espaço'
)
conferir(!texto.includes('?'), 'nenhum caractere virou "?" no cupom')
conferir(
  bytes.includes(0x1d) && texto.includes('\x1dVB'),
  'comando de cortar o papel no fim'
)

console.log('\n--- prévia do cupom ---')
console.log(
  texto
    .replace(/\x1b[@!aE][\x00-\xff]?/g, '')
    .replace(/\x1d[!V][\x00-\xff]{0,2}/g, '')
    .split('\n')
    .slice(0, 34)
    .map((l) => `  | ${l}`)
    .join('\n')
)

// ------------------------------------------------------ limpeza
await sql(`delete from public.pedidos;`)
await rm(join(raiz, 'agente-impressao', '.env'), { force: true })

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
