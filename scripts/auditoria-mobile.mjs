/**
 * Auditoria de uso em celular e tablet.
 *
 * Procura os defeitos que só aparecem na mão do cliente:
 *   - rolagem horizontal (o pior deles: a página "foge" para o lado)
 *   - botões pequenos demais para o dedo (< 40px)
 *   - texto miúdo demais para ler
 *   - campo que faz o iPhone dar zoom sozinho (fonte < 16px)
 *
 * Uso:  node scripts/auditoria-mobile.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { env, EMAIL_ADMIN, SENHA_ADMIN } from './credenciais.mjs'

const BASE = 'http://localhost:3000'
const TIROS = 'C:/Users/adoni/cardapio-online/.testes/mobile'
await mkdir(TIROS, { recursive: true })

const APARELHOS = [
  { nome: 'celular-pequeno', largura: 360, altura: 740 },
  { nome: 'celular-comum', largura: 390, altura: 844 },
  { nome: 'tablet-restaurante', largura: 820, altura: 1180 },
]

const EMAIL = EMAIL_ADMIN
const SENHA = SENHA_ADMIN

let problemas = 0

async function auditar(pagina, rotulo, aparelho) {
  const achados = await pagina.evaluate(() => {
    const relatos = []

    // 1. a página vaza para o lado?
    const larguraDoc = document.documentElement.scrollWidth
    const larguraTela = document.documentElement.clientWidth
    if (larguraDoc > larguraTela + 1) {
      // descobre QUEM está vazando
      const culpados = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > larguraTela + 1) {
          culpados.push(
            `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} (até ${Math.round(r.right)}px)`
          )
        }
      }
      relatos.push({
        tipo: 'ROLAGEM HORIZONTAL',
        detalhe: `documento ${larguraDoc}px > tela ${larguraTela}px`,
        culpados: [...new Set(culpados)].slice(0, 4),
      })
    }

    // 2. alvos de toque pequenos
    const pequenos = []
    for (const el of document.querySelectorAll('button, a, input, select, textarea')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const estilo = getComputedStyle(el)
      if (estilo.visibility === 'hidden' || estilo.display === 'none') continue

      // Checkbox/radio dentro de <label>: quem recebe o toque é o rótulo
      // inteiro, não a caixinha. Mede o alvo real.
      const rotulo = el.closest('label')
      if (rotulo && (el.type === 'checkbox' || el.type === 'radio')) {
        const rr = rotulo.getBoundingClientRect()
        if (rr.height >= 40 || rr.width >= 40) continue
      }

      if (r.height < 40 && r.width < 40) {
        const texto = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)
        pequenos.push(`${el.tagName.toLowerCase()} "${texto}" ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    if (pequenos.length) {
      relatos.push({
        tipo: 'ALVO DE TOQUE PEQUENO',
        detalhe: `${pequenos.length} elemento(s) abaixo de 40px`,
        culpados: [...new Set(pequenos)].slice(0, 5),
      })
    }

    // 3. campo que dispara zoom automático no iPhone
    // Só vale para campo em que se DIGITA: checkbox, radio, cor e range
    // não disparam o zoom do Safari.
    const DIGITAVEIS = [
      'text', 'email', 'tel', 'number', 'password', 'search',
      'url', 'date', 'time', 'datetime-local', 'month', 'week',
    ]
    const zoom = []
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.tagName === 'INPUT' && !DIGITAVEIS.includes(el.type)) continue
      const tamanho = parseFloat(getComputedStyle(el).fontSize)
      if (tamanho < 16) zoom.push(`${el.tagName.toLowerCase()}#${el.id || '?'} ${tamanho}px`)
    }
    if (zoom.length) {
      relatos.push({
        tipo: 'ZOOM AUTOMATICO NO IPHONE',
        detalhe: `${zoom.length} campo(s) com fonte < 16px`,
        culpados: [...new Set(zoom)].slice(0, 5),
      })
    }

    // 4. texto miúdo
    const miudo = []
    for (const el of document.querySelectorAll('p, span, li, td, label, h1, h2, h3')) {
      if (!el.textContent?.trim()) continue
      if (el.children.length > 0) continue
      const tamanho = parseFloat(getComputedStyle(el).fontSize)
      if (tamanho > 0 && tamanho < 11) {
        miudo.push(`"${el.textContent.trim().slice(0, 25)}" ${tamanho}px`)
      }
    }
    if (miudo.length) {
      relatos.push({
        tipo: 'TEXTO MIUDO',
        detalhe: `${miudo.length} trecho(s) abaixo de 11px`,
        culpados: [...new Set(miudo)].slice(0, 4),
      })
    }

    return relatos
  })

  if (achados.length) {
    console.log(`\n  [${aparelho.nome} ${aparelho.largura}px] ${rotulo}`)
    for (const a of achados) {
      console.log(`    ! ${a.tipo}: ${a.detalhe}`)
      for (const c of a.culpados) console.log(`        ${c}`)
      problemas++
    }
  }
}

const navegador = await chromium.launch()

for (const aparelho of APARELHOS) {
  const contexto = await navegador.newContext({
    viewport: { width: aparelho.largura, height: aparelho.altura },
    hasTouch: true,
    isMobile: aparelho.largura < 800,
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()

  // --------- telas do cliente ---------
  await pagina.goto(BASE, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  await auditar(pagina, 'escolha de modo', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-01-escolha.png` })

  // entra como "vou levar"
  const botaoViagem = pagina.getByRole('button', { name: /é para viagem/i })
  if (await botaoViagem.count()) {
    await botaoViagem.first().click()
    await pagina.waitForTimeout(1500)
  }
  await auditar(pagina, 'cardápio', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-02-cardapio.png` })

  // abre um produto com opções
  const produto = pagina.getByRole('button', { name: /Churrasco misto|Marmita/ })
  if (await produto.count()) {
    await produto.first().click()
    await pagina.waitForTimeout(800)
    await auditar(pagina, 'produto (modal)', aparelho)
    await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-03-produto.png` })

    const adicionar = pagina.getByRole('button', { name: /^Adicionar/ })
    if (await adicionar.count()) {
      await adicionar.first().click()
      await pagina.waitForTimeout(800)
    }
  }

  await pagina.goto(`${BASE}/carrinho`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  await auditar(pagina, 'carrinho', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-04-carrinho.png` })

  await pagina.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(800)
  await auditar(pagina, 'checkout', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-05-checkout.png`, fullPage: true })

  await pagina.goto(`${BASE}/meus-pedidos`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  await auditar(pagina, 'meus pedidos', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-06-meus-pedidos.png`, fullPage: true })

  await pagina.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(600)
  await auditar(pagina, 'entrar com WhatsApp', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-07-entrar.png`, fullPage: true })

  // --------- painel do dono (tablet importa mais) ---------
  await pagina.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(500)
  await auditar(pagina, 'login do painel', aparelho)

  await pagina.getByLabel('E-mail').fill(EMAIL)
  await pagina.getByLabel('Senha').fill(SENHA)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await pagina.waitForURL('**/admin', { timeout: 20000 }).catch(() => {})
  await pagina.waitForTimeout(1500)
  await auditar(pagina, 'painel de pedidos', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-06-painel.png`, fullPage: true })

  await pagina.goto(`${BASE}/admin/cardapio`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1000)
  await auditar(pagina, 'admin cardápio', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-07-admin-cardapio.png`, fullPage: true })

  await pagina.goto(`${BASE}/admin/config`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1000)
  await auditar(pagina, 'admin configurações', aparelho)
  await pagina.screenshot({ path: `${TIROS}/${aparelho.nome}-08-admin-config.png`, fullPage: true })

  await contexto.close()
}

await navegador.close()

console.log(
  problemas === 0
    ? '\n============================================\n  Nenhum problema de uso em celular/tablet\n============================================'
    : `\n============================================\n  ${problemas} problema(s) encontrado(s)\n============================================`
)
