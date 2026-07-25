/**
 * Roda os arquivos de supabase/migrations no projeto configurado no .env.local,
 * via API de gerenciamento do Supabase.
 *
 * Uso:  node scripts/rodar-migrations.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// leitura simples do .env.local (sem dependência externa)
const env = {}
for (const linha of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const limpa = linha.trim()
  if (!limpa || limpa.startsWith('#')) continue
  const igual = limpa.indexOf('=')
  if (igual < 1) continue
  env[limpa.slice(0, igual).trim()] = limpa.slice(igual + 1).trim()
}

const projeto = env.PROJECT_ID
const token = env.SUPABASE_ACCESS_TOKEN
if (!projeto || !token) {
  console.error('Faltam PROJECT_ID ou SUPABASE_ACCESS_TOKEN no .env.local')
  process.exit(1)
}

async function executar(sql) {
  const resposta = await fetch(
    `https://api.supabase.com/v1/projects/${projeto}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  const texto = await resposta.text()
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${texto}`)
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

const pasta = join(raiz, 'supabase', 'migrations')
const arquivos = (await readdir(pasta)).filter((n) => n.endsWith('.sql')).sort()

for (const arquivo of arquivos) {
  process.stdout.write(`\n>> ${arquivo} ... `)
  const sql = await readFile(join(pasta, arquivo), 'utf8')
  try {
    await executar(sql)
    console.log('OK')
  } catch (erro) {
    console.log('FALHOU')
    console.error(String(erro.message).slice(0, 2000))
    process.exit(1)
  }
}

console.log('\n--- conferindo o que foi criado ---')
const tabelas = await executar(`
  select table_name, (select count(*) from information_schema.columns c
                      where c.table_name = t.table_name and c.table_schema = 'public') as colunas
  from information_schema.tables t
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name;
`)
console.table(tabelas)

const contagens = await executar(`
  select 'categorias' as tabela, count(*)::int from public.categorias
  union all select 'produtos', count(*)::int from public.produtos
  union all select 'grupos_opcoes', count(*)::int from public.grupos_opcoes
  union all select 'opcoes', count(*)::int from public.opcoes
  union all select 'cupons', count(*)::int from public.cupons
  union all select 'bairros_entrega', count(*)::int from public.bairros_entrega
  union all select 'horarios', count(*)::int from public.horarios;
`)
console.table(contagens)
