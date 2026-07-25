/**
 * Prova que o dono consegue criar e editar produto, inclusive trocando a foto.
 *
 * Uso:  node scripts/teste-cadastro-produto.mjs   (com o `npm run dev` no ar)
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
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
const EMAIL = 'financeiro@radiobrasdigital.com.br'
const SENHA = 'BrasaViva#2026'
const NOME_TESTE = 'Prato de Teste do Dono'

let ok = 0
let falhas = 0
const bom = (m) => (ok++, console.log(`  [ok] ${m}`))
const ruim = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? bom(m) : ruim(m))

// foto de mentira, como se o dono tivesse tirado no celular
const arquivoFoto = join(TIROS, 'foto-do-dono.jpg')
await writeFile(
  arquivoFoto,
  await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 200, g: 40, b: 30 } },
  })
    .jpeg()
    .toBuffer()
)

await sql(`delete from public.produtos where nome = '${NOME_TESTE}';`)

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
const pagina = await contexto.newPage()

const errosDeConsole = []
pagina.on('pageerror', (e) => errosDeConsole.push(String(e)))

try {
  // ---------------------------------------------------------- login
  await pagina.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('E-mail').fill(EMAIL)
  await pagina.getByLabel('Senha').fill(SENHA)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await pagina.waitForURL('**/admin', { timeout: 20000 })

  // ------------------------------------------------- criar produto
  console.log('\n1) Criar produto novo')
  await pagina.goto(`${BASE}/admin/cardapio/novo`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)

  await pagina.getByLabel('Nome').fill(NOME_TESTE)
  await pagina.getByLabel('Descrição').fill('Criado pelo teste, com foto enviada do computador.')
  await pagina.getByLabel('Preço (R$)').fill('42,50')
  await pagina.getByLabel('Preço promocional (opcional)').fill('35,90')

  // envia a foto
  await pagina.setInputFiles('input[type="file"]', arquivoFoto)
  await pagina.waitForTimeout(4000)
  conferir(
    (await pagina.locator('img[src*="supabase"], img[src*="storage"]').count()) > 0,
    'foto subiu e apareceu na tela antes de salvar'
  )

  await pagina.getByRole('button', { name: /Criar produto/ }).click()
  await pagina.waitForURL(/\/admin\/cardapio\/[0-9a-f-]{36}/, { timeout: 20000 })
  await pagina.waitForTimeout(1500)

  const criado = (
    await sql(
      `select id, nome, preco_centavos, preco_promo_centavos, imagem_url, disponivel
         from public.produtos where nome = '${NOME_TESTE}';`
    )
  )[0]

  conferir(Boolean(criado), 'produto gravado no banco')
  conferir(criado?.preco_centavos === 4250, `preço salvo em centavos: ${criado?.preco_centavos}`)
  conferir(
    criado?.preco_promo_centavos === 3590,
    `promoção salva: ${criado?.preco_promo_centavos}`
  )
  conferir(
    Boolean(criado?.imagem_url) && criado.imagem_url.includes('/storage/'),
    'foto foi para o Storage e ficou ligada ao produto'
  )

  // a foto está mesmo acessível?
  const respostaFoto = await fetch(criado.imagem_url)
  conferir(respostaFoto.ok, `foto abre pela URL pública (HTTP ${respostaFoto.status})`)

  await pagina.screenshot({ path: `${TIROS}/produto-01-criado.png`, fullPage: true })

  // ------------------------------------------------- grupo de opções
  console.log('\n2) Montar um grupo de opções')
  await pagina.getByRole('button', { name: /Novo grupo/ }).click()
  await pagina.waitForTimeout(600)
  await pagina.getByLabel('Nome do grupo').fill('Ponto da carne')
  await pagina.getByLabel('Mínimo').fill('1')
  await pagina.getByLabel('Máximo').fill('1')
  await pagina.getByRole('button', { name: 'Salvar', exact: true }).click()
  await pagina.waitForTimeout(2500)

  conferir(
    await pagina.getByText('Ponto da carne').first().isVisible(),
    'grupo de opções criado'
  )

  await pagina.getByRole('button', { name: /Adicionar opção/ }).first().click()
  await pagina.waitForTimeout(600)
  await pagina.getByLabel('Nome').last().fill('Bem passado')
  await pagina.getByLabel('Custa a mais (R$)').fill('3,00')
  await pagina.getByRole('button', { name: 'Salvar', exact: true }).click()
  await pagina.waitForTimeout(2500)

  const opcoes = await sql(
    `select o.nome, o.preco_extra_centavos
       from public.opcoes o
       join public.grupos_opcoes g on g.id = o.grupo_id
       join public.produtos p on p.id = g.produto_id
      where p.nome = '${NOME_TESTE}';`
  )
  conferir(
    opcoes.length === 1 && opcoes[0].preco_extra_centavos === 300,
    `opção criada com adicional de R$ ${(opcoes[0]?.preco_extra_centavos ?? 0) / 100}`
  )
  await pagina.screenshot({ path: `${TIROS}/produto-02-opcoes.png`, fullPage: true })

  // ------------------------------------------------- editar produto
  console.log('\n3) Editar o produto')
  await pagina.getByLabel('Nome').first().fill(`${NOME_TESTE} editado`)
  await pagina.getByLabel('Preço (R$)').fill('55,00')
  await pagina.getByRole('button', { name: /Salvar alterações/ }).click()
  await pagina.waitForTimeout(2500)

  const editado = (
    await sql(
      `select nome, preco_centavos from public.produtos where nome like '${NOME_TESTE}%';`
    )
  )[0]
  conferir(
    editado?.nome === `${NOME_TESTE} editado` && editado?.preco_centavos === 5500,
    `edição salva: "${editado?.nome}" por R$ ${(editado?.preco_centavos ?? 0) / 100}`
  )

  // ------------------------------------------------- trocar a foto
  console.log('\n4) Trocar a foto')
  const outraFoto = join(TIROS, 'foto-do-dono-2.jpg')
  await writeFile(
    outraFoto,
    await sharp({
      create: { width: 1000, height: 800, channels: 3, background: { r: 20, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer()
  )
  await pagina.getByRole('button', { name: 'trocar foto' }).click()
  await pagina.setInputFiles('input[type="file"]', outraFoto)
  await pagina.waitForTimeout(4000)
  await pagina.getByRole('button', { name: /Salvar alterações/ }).click()
  await pagina.waitForTimeout(2500)

  const comNovaFoto = (
    await sql(`select imagem_url from public.produtos where nome like '${NOME_TESTE}%';`)
  )[0]
  conferir(
    comNovaFoto?.imagem_url !== criado.imagem_url,
    'foto trocada (endereço mudou)'
  )

  // ------------------------------------------------- aparece pro cliente?
  console.log('\n5) O cliente vê?')
  const cliente = await (await navegador.newContext()).newPage()
  await cliente.goto(BASE, { waitUntil: 'networkidle' })
  const escolha = cliente.getByRole('button', { name: /Pedido para/ })
  if (await escolha.count()) {
    await escolha.first().click()
    await cliente.waitForTimeout(2000)
  }
  await cliente.waitForTimeout(1000)
  conferir(
    (await cliente.getByRole('button', { name: new RegExp(NOME_TESTE) }).count()) > 0,
    'produto novo já aparece no cardápio do cliente'
  )
  await cliente.close()

  // ------------------------------------------------- apagar
  console.log('\n6) Apagar o produto')
  pagina.once('dialog', (d) => d.accept())
  await pagina.getByRole('button', { name: /Apagar produto/ }).click()
  await pagina.waitForURL('**/admin/cardapio', { timeout: 20000 })
  await pagina.waitForTimeout(1500)

  const sobrou = await sql(
    `select count(*)::int as n from public.produtos where nome like '${NOME_TESTE}%';`
  )
  conferir(sobrou[0].n === 0, 'produto apagado do cardápio')
} catch (erro) {
  ruim(`erro inesperado: ${erro.message}`)
  await pagina.screenshot({ path: `${TIROS}/produto-erro.png`, fullPage: true }).catch(() => {})
} finally {
  await navegador.close()
}

console.log('\n============================================')
console.log(`  ${ok} verificações passaram, ${falhas} falharam`)
if (errosDeConsole.length) {
  console.log(`  erros de console: ${errosDeConsole.length}`)
  for (const e of errosDeConsole.slice(0, 5)) console.log(`   - ${e.slice(0, 160)}`)
}
console.log('============================================')
process.exit(falhas > 0 ? 1 : 0)
