/** Tira uma foto do cardápio, para conferir as imagens dos pratos. */
import { chromium } from 'playwright'
const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 420, height: 2600 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
const b = p.getByRole('button', { name: /Pedido para/ })
if (await b.count()) { await b.first().click(); await p.waitForTimeout(2500) }
await p.waitForTimeout(2000)
await p.screenshot({ path: 'C:/Users/adoni/cardapio-online/.testes/fotos-viagem.png' })
await nav.close()
console.log('pronto')
