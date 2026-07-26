/**
 * Gera o ícone do site (a "carinha" na aba do navegador) a partir do B da marca.
 *
 * O Next serve automaticamente o que estiver em src/app/icon.png e
 * src/app/apple-icon.png — não precisa de <link> no HTML.
 *
 * Uso: node scripts/gerar-favicon.mjs "caminho/do/B.jpg"
 */
import sharp from 'sharp'

const origem = process.argv[2]
if (!origem) {
  console.error('Uso: node scripts/gerar-favicon.mjs "caminho/do/B.jpg"')
  process.exit(1)
}

const info = await sharp(origem).metadata()
console.log(`original: ${info.width}x${info.height}`)

// Deixa quadrado sem cortar o B: completa com o preto da marca em vez de
// recortar. Ícone de aba é minúsculo, e cortar a letra deixaria irreconhecível.
const lado = Math.max(info.width ?? 0, info.height ?? 0)

const quadrado = await sharp(origem)
  .resize(lado, lado, {
    fit: 'contain',
    background: { r: 10, g: 10, b: 10 },
  })
  .toBuffer()

for (const [arquivo, tamanho] of [
  ['src/app/icon.png', 512],
  ['src/app/apple-icon.png', 180],
]) {
  await sharp(quadrado)
    .resize(tamanho, tamanho, { fit: 'cover' })
    .png()
    .toFile(arquivo)
  console.log(`  ${arquivo} (${tamanho}x${tamanho})`)
}
