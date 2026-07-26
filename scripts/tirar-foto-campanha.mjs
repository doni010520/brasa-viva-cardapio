/**
 * Faz um pedido de verdade e fotografa a tela de agradecimento: primeiro com
 * o modal da campanha aberto (que é o destaque), depois a página por baixo.
 *
 * Uso:  node scripts/tirar-foto-campanha.mjs
 */
import { chromium } from 'playwright'
import { env } from './credenciais.mjs'
import { limparDadosDeTeste } from './limpeza.mjs'

const BASE = 'http://localhost:3000'
const TIROS = 'C:/Users/adoni/cardapio-online/.testes'

const sql = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  }).then((r) => r.json())

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()

try {
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: /é para viagem/i }).click()
  await p.waitForTimeout(2000)
  await p.getByRole('button', { name: /Marmita do dia/ }).first().click()
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: /^Adicionar/ }).click()
  await p.waitForTimeout(800)

  await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)
  await p.getByLabel('Nome').fill('Cliente Demonstracao')
  await p.getByLabel('Telefone (WhatsApp)').fill('71999998888')
  await p.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
  await p.waitForURL('**/obrigado', { timeout: 20000 })

  // o modal espera um respiro antes de abrir, para o "pedido confirmado" ser
  // lido primeiro; a foto tem que esperar junto
  await p.waitForTimeout(1600)
  await p.screenshot({ path: `${TIROS}/campanha-modal.png` })
  console.log('modal fotografado')

  await p.getByRole('button', { name: 'Agora não' }).click()
  await p.waitForTimeout(600)
  await p.screenshot({ path: `${TIROS}/campanha-pagina.png`, fullPage: true })
  console.log('página fotografada')

  const href = await p.locator('a[href*="instagram"]').first().getAttribute('href')
  console.log('para onde o botão leva:', href)
} finally {
  await nav.close()
  await limparDadosDeTeste(sql)
}
