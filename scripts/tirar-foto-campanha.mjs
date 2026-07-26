/** Faz um pedido de verdade e fotografa a tela de agradecimento com a campanha. */
import { chromium } from 'playwright'
const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 420, height: 1400 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()

await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: /é para viagem/i }).click()
await p.waitForTimeout(2000)
await p.getByRole('button', { name: /Marmita do dia/ }).first().click()
await p.waitForTimeout(800)
await p.getByRole('button', { name: /^Adicionar/ }).click()
await p.waitForTimeout(800)

await p.goto('http://localhost:3000/checkout', { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)
await p.getByLabel('Nome').fill('Cliente Demonstracao')
await p.getByLabel('Telefone (WhatsApp)').fill('71999998888')
await p.getByRole('button', { name: /Enviar pedido|Ir para o pagamento/ }).click()
await p.waitForURL('**/obrigado', { timeout: 20000 })
await p.waitForTimeout(1500)

await p.screenshot({ path: 'C:/Users/adoni/cardapio-online/.testes/campanha.png', fullPage: true })

const botao = await p.getByRole('link', { name: /bombom|Instagram/i }).count()
const href = await p.locator('a[href*="instagram"]').first().getAttribute('href')
console.log('botao da campanha na tela:', botao > 0)
console.log('para onde ele leva:', href)
await nav.close()
