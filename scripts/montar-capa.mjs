/**
 * Monta a capa da tela de entrada a partir de N fotos do restaurante.
 *
 * As fotos vêm do WhatsApp, então chegam pequenas e comprimidas. O script
 * NÃO amplia além do que a origem aguenta: esticar foto de celular só borra.
 * Quando chegarem fotos melhores, é só rodar de novo com os arquivos novos.
 *
 * Uso:
 *   node scripts/montar-capa.mjs "foto1.jpg" "foto2.jpg" ["foto3.jpg" ...]
 *
 * Layout conforme a quantidade:
 *   1 foto  -> faixa única
 *   2 fotos -> lado a lado
 *   3 fotos -> uma maior à esquerda, duas empilhadas à direita
 *   4+      -> grade de quatro
 */
import sharp from 'sharp'

const fotos = process.argv.slice(2)
if (fotos.length === 0) {
  console.error('Informe pelo menos uma foto.')
  process.exit(1)
}

const LARGURA = 960
const ALTURA = 460
const VAO = 4 // respiro entre as fotos, na cor da marca

async function recorte(caminho, largura, altura) {
  return sharp(caminho)
    .resize(largura, altura, { fit: 'cover', position: 'attention' })
    .toBuffer()
}

const usadas = fotos.slice(0, 4)
const partes = []

if (usadas.length === 1) {
  partes.push({ input: await recorte(usadas[0], LARGURA, ALTURA), left: 0, top: 0 })
} else if (usadas.length === 2) {
  const l = Math.floor((LARGURA - VAO) / 2)
  partes.push({ input: await recorte(usadas[0], l, ALTURA), left: 0, top: 0 })
  partes.push({ input: await recorte(usadas[1], l, ALTURA), left: l + VAO, top: 0 })
} else if (usadas.length === 3) {
  const lGrande = Math.floor(LARGURA * 0.55)
  const lPequena = LARGURA - lGrande - VAO
  const aPequena = Math.floor((ALTURA - VAO) / 2)
  partes.push({ input: await recorte(usadas[0], lGrande, ALTURA), left: 0, top: 0 })
  partes.push({ input: await recorte(usadas[1], lPequena, aPequena), left: lGrande + VAO, top: 0 })
  partes.push({
    input: await recorte(usadas[2], lPequena, ALTURA - aPequena - VAO),
    left: lGrande + VAO,
    top: aPequena + VAO,
  })
} else {
  const l = Math.floor((LARGURA - VAO) / 2)
  const a = Math.floor((ALTURA - VAO) / 2)
  const posicoes = [
    [0, 0],
    [l + VAO, 0],
    [0, a + VAO],
    [l + VAO, a + VAO],
  ]
  for (const [i, [left, top]] of posicoes.entries()) {
    partes.push({ input: await recorte(usadas[i], l, a), left, top })
  }
}

await sharp({
  create: {
    width: LARGURA,
    height: ALTURA,
    channels: 3,
    // o vão entre as fotos sai no vermelho da marca
    background: { r: 227, g: 6, b: 19 },
  },
})
  .composite(partes)
  .webp({ quality: 84 })
  .toFile('public/fachada.webp')

const info = await sharp('public/fachada.webp').metadata()
console.log(`capa montada com ${usadas.length} foto(s): ${info.width}x${info.height}`)
for (const [i, f] of usadas.entries()) {
  const m = await sharp(f).metadata()
  console.log(`  ${i + 1}. ${f.split(/[\\/]/).pop()} (${m.width}x${m.height})`)
}
if (fotos.length > 4) {
  console.log(`\nAtenção: ${fotos.length - 4} foto(s) ficaram de fora — a capa usa no máximo 4.`)
}
