/**
 * Testa os perfis de acesso, inclusive tentando furar as barreiras:
 * um atendente logado tentando abrir telas e disparar ações de dono.
 *
 * Uso:  node scripts/teste-perfis.mjs   (com o `npm run dev` no ar)
 */
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'

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
  if (!r.ok) throw new Error(t.slice(0, 500))
  return JSON.parse(t)
}

const BASE = 'http://localhost:3000'
const DONO = { email: EMAIL_ADMIN, senha: SENHA_ADMIN }
const ATENDENTE = {
  email: 'atendente.teste@brasaviva.local',
  senha: env.TESTE_SENHA_ATENDENTE ?? 'trocar-no-env-local',
}

let ok = 0
let falhas = 0
const conferir = (c, m) =>
  c ? (ok++, console.log(`  [ok] ${m}`)) : (falhas++, console.log(`  [FALHA] ${m}`))

// limpa sobra de execução anterior
const antigos = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
}).then((r) => r.json())

for (const u of antigos.users ?? []) {
  if (u.email === ATENDENTE.email) {
    await sql(`delete from public.admins where user_id = '${u.id}';`)
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
  }
}

const navegador = await chromium.launch()

async function entrar(credenciais) {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await p.getByLabel('E-mail').fill(credenciais.email)
  await p.getByLabel('Senha').fill(credenciais.senha)
  await p.getByRole('button', { name: 'Entrar' }).click()
  // espera SAIR do login: '**/admin**' casaria com a própria página de login
  // e o teste seguiria antes de a sessão existir.
  await p.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: 20000 })
  await p.waitForTimeout(1000)
  return p
}

try {
  // ------------------------------------------- 1. o dono cria o atendente
  console.log('\n1) O dono cadastra um atendente')
  const dono = await entrar(DONO)

  await dono.goto(`${BASE}/admin/usuarios`, { waitUntil: 'networkidle' })
  await dono.waitForTimeout(1000)
  conferir(await dono.getByRole('heading', { name: 'Equipe' }).isVisible(), 'tela de equipe abre para o dono')

  await dono.getByRole('button', { name: /Adicionar pessoa/ }).click()
  await dono.waitForTimeout(600)
  await dono.getByLabel('Nome').fill('Atendente de Teste')
  await dono.getByLabel(/E-mail/).fill(ATENDENTE.email)
  await dono.getByLabel('Senha', { exact: true }).fill(ATENDENTE.senha)
  await dono.getByLabel('Perfil').selectOption('atendente')
  await dono.getByRole('button', { name: /Criar acesso/ }).click()
  await dono.waitForTimeout(3500)

  const criado = await sql(
    `select papel, ativo from public.admins where email = '${ATENDENTE.email}';`
  )
  conferir(
    criado[0]?.papel === 'atendente' && criado[0]?.ativo === true,
    'atendente criado com o perfil certo'
  )
  await dono.screenshot({ path: `${TIROS}/perfis-01-equipe.png`, fullPage: true })

  // ------------------------------------------- 2. o que o atendente vê
  console.log('\n2) O que o atendente enxerga')
  const atendente = await entrar(ATENDENTE)

  conferir(
    await atendente.getByRole('heading', { name: 'Pedidos de hoje' }).isVisible(),
    'entra e cai na tela de pedidos'
  )
  conferir(
    await atendente.getByText('Atendente', { exact: true }).first().isVisible(),
    'o painel mostra o perfil dele'
  )

  for (const item of ['Clientes', 'Relatórios', 'Configurações', 'Cupons', 'Mesas', 'Equipe']) {
    conferir(
      (await atendente.getByRole('link', { name: item, exact: true }).count()) === 0,
      `menu NÃO mostra "${item}"`
    )
  }
  conferir(
    (await atendente.getByRole('link', { name: 'Cardápio', exact: true }).count()) > 0,
    'menu mostra "Cardápio" (para marcar esgotado)'
  )
  await atendente.screenshot({ path: `${TIROS}/perfis-02-atendente.png`, fullPage: true })

  // ------------------------------------------- 3. tentando entrar na marra
  console.log('\n3) Digitando o endereço na barra, na marra')
  for (const rota of [
    '/admin/relatorios',
    '/admin/clientes',
    '/admin/config',
    '/admin/cupons',
    '/admin/mesas',
    '/admin/usuarios',
  ]) {
    await atendente.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
    await atendente.waitForTimeout(700)
    const foiBarrado = new URL(atendente.url()).pathname === '/admin'
    conferir(foiBarrado, `${rota} devolve para os pedidos`)
  }

  // a planilha de vendas também não pode
  const planilha = await atendente.request.get(`${BASE}/admin/relatorios/csv?periodo=30`, {
    maxRedirects: 0,
  })
  const corpoPlanilha = await planilha.text()
  conferir(
    !corpoPlanilha.includes('Faturamento'),
    'não consegue baixar a planilha de faturamento'
  )

  // ------------------------------------------- 4. o que ele PODE fazer
  console.log('\n4) O que ele precisa poder fazer')
  await atendente.goto(`${BASE}/admin/cardapio`, { waitUntil: 'networkidle' })
  await atendente.waitForTimeout(1200)

  conferir(
    (await atendente.getByRole('button', { name: /Nova categoria/ }).count()) === 0,
    'não vê o botão de criar categoria'
  )
  conferir(
    (await atendente.getByRole('link', { name: /Novo produto/ }).count()) === 0,
    'não vê o botão de novo produto'
  )
  conferir(
    (await atendente.getByRole('link', { name: /^Editar / }).count()) === 0,
    'não vê o lápis de editar produto'
  )

  const botaoEsgotar = atendente.getByRole('button', { name: /à venda\. Marcar como esgotado/i })
  conferir((await botaoEsgotar.count()) > 0, 'VÊ o botão de esgotar item')

  const nomeProduto = (await botaoEsgotar.first().getAttribute('aria-label'))?.split(':')[0]
  await botaoEsgotar.first().click()
  await atendente.waitForTimeout(2500)

  const esgotado = await sql(
    `select disponivel from public.produtos where nome = '${nomeProduto?.replace(/'/g, "''")}';`
  )
  conferir(esgotado[0]?.disponivel === false, `conseguiu esgotar "${nomeProduto}"`)

  // devolve
  await atendente
    .getByRole('button', { name: new RegExp(`${nomeProduto}: esgotado`, 'i') })
    .first()
    .click()
  await atendente.waitForTimeout(2000)

  // ------------------------------------------- 5. e o pedido?
  console.log('\n5) Operar pedido')
  await atendente.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await atendente.waitForTimeout(800)
  conferir(
    (await atendente.getByText('Faturamento hoje').count()) === 0,
    'NÃO vê o faturamento do dia no painel'
  )
  conferir(
    (await atendente.getByText('Pedidos hoje').count()) > 0,
    'vê a contagem de pedidos, que precisa para trabalhar'
  )

  // ------------------------------------------- 6. o último dono é protegido
  console.log('\n6) Trava do último dono')
  const tentativa = await sql(`
    do $$
    begin
      begin
        update public.admins set papel = 'atendente'
         where email = '${DONO.email}';
        raise notice 'PASSOU';
      exception when others then
        raise notice 'BARRADO';
      end;
    end $$;
    select papel from public.admins where email = '${DONO.email}';
  `)
  conferir(
    tentativa[0]?.papel === 'dono',
    'o banco recusa rebaixar o último dono (continua dono)'
  )
} catch (e) {
  falhas++
  console.log(`  [FALHA] erro inesperado: ${e.message}`)
} finally {
  await navegador.close()
}

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
