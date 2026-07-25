/** Compara lado a lado as duas telas, para conferir se dá para confundir. */
import { chromium } from 'playwright'
const nav = await chromium.launch()

for (const [modo, botao] of [['salao', /estou no salão/i], ['viagem', /é para viagem/i]]) {
  const ctx = await nav.newContext({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  const b = p.getByRole('button', { name: botao })
  if (await b.count()) { await b.first().click(); await p.waitForTimeout(2500) }
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `C:/Users/adoni/cardapio-online/.testes/modo-${modo}.png` })
  await ctx.close()
}
await nav.close()
console.log('pronto')
