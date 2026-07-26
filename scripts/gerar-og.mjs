/**
 * Gera a imagem que aparece na prévia do link (WhatsApp, Instagram, Google).
 *
 * Três detalhes que decidem se a imagem aparece ou não no WhatsApp:
 *   - JPEG. WebP e AVIF costumam não renderizar na prévia;
 *   - 1200x630, a proporção que todo mundo espera;
 *   - arquivo leve. Prévia grande demais o WhatsApp simplesmente ignora.
 *
 * Uso:  node scripts/gerar-og.mjs
 */
import sharp from 'sharp'
import { stat } from 'node:fs/promises'

const LARGURA = 1200
const ALTURA = 630

const fundo = await sharp('public/fachada.webp')
  .resize(LARGURA, ALTURA, { fit: 'cover', position: 'attention' })
  .modulate({ saturation: 1.15 })
  .toBuffer()

// A mesma camada preta da tela de entrada: foto de celular tem brilho
// imprevisível, e o texto por cima precisa ser legível em qualquer uma.
const veu = Buffer.from(
  `<svg width="${LARGURA}" height="${ALTURA}">
     <defs>
       <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#0d0b0a" stop-opacity="0.55"/>
         <stop offset="0.55" stop-color="#0d0b0a" stop-opacity="0.72"/>
         <stop offset="1" stop-color="#0d0b0a" stop-opacity="0.92"/>
       </linearGradient>
     </defs>
     <rect width="${LARGURA}" height="${ALTURA}" fill="url(#v)"/>
   </svg>`
)

// A logo é JPEG, então vem com fundo preto quadrado. Arredondar as quinas
// faz ela parecer um selo em cima da foto, e não um recorte mal colado.
const LADO = 150
const cantos = Buffer.from(
  `<svg width="${LADO}" height="${LADO}"><rect width="${LADO}" height="${LADO}" rx="30" fill="#fff"/></svg>`
)
const logo = await sharp('public/logo.jpg')
  .resize(LADO, LADO, { fit: 'contain', background: '#0d0b0a' })
  .composite([{ input: cantos, blend: 'dest-in' }])
  .png()
  .toBuffer()

const texto = Buffer.from(
  `<svg width="${LARGURA}" height="${ALTURA}">
     <style>
       .nome { font: 800 76px 'Segoe UI', Arial, sans-serif; fill: #ffffff; }
       .frase { font: 400 34px 'Segoe UI', Arial, sans-serif; fill: #ffffff; opacity: 0.85; }
       .chamada { font: 700 30px 'Segoe UI', Arial, sans-serif; fill: #0d0b0a; }
     </style>
     <text x="90" y="330" class="nome">Churrascaria Brasa Viva</text>
     <text x="90" y="388" class="frase">O Tradicional Churrasco Baiano</text>
     <rect x="88" y="430" width="392" height="66" rx="33" fill="#e30613"/>
     <text x="120" y="473" class="chamada" fill="#ffffff">Peça pelo celular</text>
   </svg>`
)

await sharp(fundo)
  .composite([
    { input: veu, top: 0, left: 0 },
    { input: logo, top: 60, left: 88 },
    { input: texto, top: 0, left: 0 },
  ])
  // 82 dá arquivo pequeno o bastante para o WhatsApp aceitar sem borrar
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/og.jpg')

const info = await sharp('public/og.jpg').metadata()
const { size } = await stat('public/og.jpg')
console.log(`public/og.jpg: ${info.width}x${info.height}, ${Math.round(size / 1024)} KB`)
if (size > 300 * 1024) {
  console.log('Atenção: acima de 300 KB o WhatsApp pode ignorar a prévia.')
}
