/**
 * Monta a capa da tela de entrada a partir de N fotos do restaurante.
 *
 * Gera dois arquivos, porque são dois usos diferentes:
 *   public/fachada.webp        faixa deitada (960x460) — uso geral, og:image
 *   public/fachada-fundo.webp  retrato (1080x1920) — fundo da tela de entrada,
 *                              que ocupa o celular inteiro por baixo de uma
 *                              camada preta
 *
 * As fotos vêm do WhatsApp, então chegam pequenas e comprimidas. O script
 * NÃO amplia além do que a origem aguenta: esticar foto de celular só borra.
 * Quando chegarem fotos melhores, é só rodar de novo com os arquivos novos.
 *
 * Uso:
 *   node scripts/montar-capa.mjs "foto1.jpg" "foto2.jpg" ["foto3.jpg" ...]
 */
import sharp from 'sharp'

const fotos = process.argv.slice(2)
if (fotos.length === 0) {
  console.error('Informe pelo menos uma foto.')
  process.exit(1)
}

const VAO = 4 // respiro entre as fotos, na cor da marca
const VERMELHO = { r: 227, g: 6, b: 19 }

async function recorte(caminho, largura, altura) {
  return sharp(caminho)
    .resize(largura, altura, { fit: 'cover', position: 'attention' })
    .toBuffer()
}

async function montar(largura, altura, partes, saida) {
  await sharp({ create: { width: largura, height: altura, channels: 3, background: VERMELHO } })
    .composite(partes)
    .webp({ quality: 84 })
    .toFile(saida)
  return saida
}

const usadas = fotos.slice(0, 4)

// ------------------------------------------------------- capa deitada
{
  const LARGURA = 960
  const ALTURA = 460
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
    partes.push({
      input: await recorte(usadas[1], lPequena, aPequena),
      left: lGrande + VAO,
      top: 0,
    })
    partes.push({
      input: await recorte(usadas[2], lPequena, ALTURA - aPequena - VAO),
      left: lGrande + VAO,
      top: aPequena + VAO,
    })
  } else {
    const l = Math.floor((LARGURA - VAO) / 2)
    const a = Math.floor((ALTURA - VAO) / 2)
    for (const [i, [left, top]] of [
      [0, 0],
      [l + VAO, 0],
      [0, a + VAO],
      [l + VAO, a + VAO],
    ].entries()) {
      partes.push({ input: await recorte(usadas[i], l, a), left, top })
    }
  }

  await montar(LARGURA, ALTURA, partes, 'public/fachada.webp')
}

// ------------------------------------------------------- fundo em retrato
{
  const LARGURA = 1080
  const ALTURA = 1920
  /** Altura em que uma faixa se dissolve na anterior. Emenda reta aparecia
   *  como um risco no meio da tela, mesmo por baixo da camada preta. */
  const FUSAO = 260

  /**
   * Recorta a faixa e apaga o topo dela num degradê, para ela derreter na
   * foto de cima. O 'dest-in' do sharp usa o alfa da máscara como alfa da
   * imagem — daí a máscara ser um SVG com opacidade variável.
   */
  async function faixa(caminho, altura, comFusao) {
    const imagem = sharp(caminho)
      .resize(LARGURA, altura, { fit: 'cover', position: 'attention' })
      // a camada preta do CSS lava a cor; devolve um pouco antes de escurecer
      .modulate({ saturation: 1.2 })
      .linear(1.08, -8)

    if (!comFusao) return imagem.png().toBuffer()

    const mascara = Buffer.from(
      `<svg width="${LARGURA}" height="${altura}">
         <defs>
           <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0" stop-color="#fff" stop-opacity="0"/>
             <stop offset="${FUSAO / altura}" stop-color="#fff" stop-opacity="1"/>
           </linearGradient>
         </defs>
         <rect width="${LARGURA}" height="${altura}" fill="url(#f)"/>
       </svg>`
    )

    return imagem
      .composite([{ input: mascara, blend: 'dest-in' }])
      .png()
      .toBuffer()
  }

  const partes = []

  if (usadas.length === 1) {
    partes.push({ input: await faixa(usadas[0], ALTURA, false), left: 0, top: 0 })
  } else {
    // Faixas horizontais empilhadas: é o que aguenta ser cortado nas laterais
    // em qualquer celular sem picotar o assunto de nenhuma foto. Elas se
    // sobrepõem no tanto da fusão, senão sobraria buraco na emenda.
    const quantas = Math.min(usadas.length, 3)
    const passo = Math.floor((ALTURA - FUSAO) / quantas)

    for (let i = 0; i < quantas; i++) {
      const topo = i === 0 ? 0 : passo * i
      const altura = i === quantas - 1 ? ALTURA - topo : passo + FUSAO
      partes.push({ input: await faixa(usadas[i], altura, i > 0), left: 0, top: topo })
    }
  }

  await montar(LARGURA, ALTURA, partes, 'public/fachada-fundo.webp')
}

for (const arquivo of ['public/fachada.webp', 'public/fachada-fundo.webp']) {
  const info = await sharp(arquivo).metadata()
  console.log(`${arquivo}: ${info.width}x${info.height}`)
}
for (const [i, f] of usadas.entries()) {
  const m = await sharp(f).metadata()
  console.log(`  ${i + 1}. ${f.split(/[\\/]/).pop()} (${m.width}x${m.height})`)
}
if (fotos.length > 4) {
  console.log(`\nAtenção: ${fotos.length - 4} foto(s) ficaram de fora — a capa usa no máximo 4.`)
}
