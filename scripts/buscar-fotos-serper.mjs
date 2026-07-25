/**
 * Busca fotos fiéis para o cardápio usando o Serper (Google Imagens),
 * recorta, sobe para o Storage do Supabase e liga em cada produto.
 *
 * Estratégia de licença: os resultados do Google são, em boa parte, fotos de
 * terceiros com direito autoral. Por isso o script PREFERE resultados vindos
 * de bancos de imagem livres (Pexels, Unsplash, Pixabay e afins) e só cai no
 * resto quando não acha nada bom. São fotos provisórias: o certo é o dono
 * trocar pelas fotos reais dos pratos dele antes de divulgar.
 *
 * Uso:  node scripts/buscar-fotos-serper.mjs [--forcar] [--so "Nome do produto"]
 */
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const linha of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const l = linha.trim()
  if (!l || l.startsWith('#')) continue
  const i = l.indexOf('=')
  if (i < 1) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim()
}

const CHAVE_SERPER = env.SERPER_API_KEY
if (!CHAVE_SERPER) {
  console.error('Falta SERPER_API_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const FORCAR = process.argv.includes('--forcar')
const indiceSo = process.argv.indexOf('--so')
const SO_ESTE = indiceSo > -1 ? process.argv[indiceSo + 1] : null

/** Domínios cuja licença permite uso comercial sem dor de cabeça. */
const BANCOS_LIVRES = [
  'pexels.com',
  'unsplash.com',
  'pixabay.com',
  'freepik.com',
  'stockvault.net',
  'burst.shopify.com',
  'kaboompics.com',
  'rawpixel.com',
]

/** Domínios que costumam devolver imagem quebrada, marca d'água ou bloqueio. */
const EVITAR = [
  'lookaside',
  'fbcdn',
  'instagram',
  'gettyimages',
  'shutterstock',
  'alamy',
  'dreamstime',
  'istockphoto',
  '123rf',
  'depositphotos',
]

/**
 * Consultas em português, do jeito que a foto do prato é indexada no Brasil.
 * A primeira que devolver uma imagem boa vence.
 */
const CONSULTAS = {
  'Buffet livre': [
    'buffet self service restaurante comida brasileira',
    'buffet de comida restaurante bandeja',
  ],
  'Buffet livre infantil': [
    'prato infantil buffet restaurante',
    'buffet self service restaurante',
  ],

  'Churrasco misto': [
    'churrasco misto prato picanha linguiça arroz farofa',
    'prato de churrasco brasileiro completo',
  ],
  'Picanha na chapa': [
    'picanha na chapa fatiada restaurante',
    'picanha fatiada na chapa quente',
  ],
  'Costela no bafo': ['costela bovina assada no bafo', 'costela de boi assada desfiando'],
  'Marmita do dia': [
    'marmita comida caseira arroz feijão bife farofa',
    'quentinha marmitex comida brasileira',
  ],

  'Porção de picanha': ['porção de picanha fatiada tábua', 'picanha fatiada porção restaurante'],
  'Porção de linguiça': ['porção de linguiça fatiada acebolada', 'linguiça calabresa porção'],
  'Porção de mandioca frita': ['porção de mandioca frita aipim frito', 'mandioca frita crocante'],
  'Porção de calabresa acebolada': [
    'porção calabresa acebolada',
    'linguiça calabresa com cebola frita',
  ],

  'Arroz branco': ['arroz branco soltinho tigela', 'porção de arroz branco'],
  'Feijão tropeiro': ['feijão tropeiro mineiro prato', 'feijão tropeiro com bacon e couve'],
  'Farofa da casa': ['farofa de bacon com ovo tigela', 'farofa pronta brasileira'],
  Vinagrete: ['vinagrete molho campanha tomate cebola', 'vinagrete brasileiro tigela'],
  'Pão de alho': ['pão de alho na brasa churrasco', 'pão de alho grelhado espeto'],

  'Refrigerante lata 350ml': ['lata de refrigerante gelada', 'refrigerante lata 350ml'],
  'Cerveja long neck 355ml': ['cerveja long neck gelada garrafa', 'garrafa long neck cerveja'],
  'Suco natural 500ml': ['suco natural copo laranja', 'suco de fruta natural copo'],
  'Água de coco 300ml': ['água de coco copo gelada', 'água de coco natural'],
  'Água mineral 500ml': ['garrafa de água mineral 500ml', 'garrafinha de água mineral'],

  'Cocada baiana': ['cocada baiana doce de coco', 'cocada branca tradicional'],
  'Pudim de leite': ['pudim de leite condensado fatia calda', 'pudim de leite caramelo'],
  'Abacaxi na brasa': ['abacaxi na brasa com canela churrasco', 'abacaxi grelhado espeto canela'],
}

async function procurar(consulta) {
  const resposta = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': CHAVE_SERPER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: consulta, gl: 'br', hl: 'pt-br', num: 20 }),
    signal: AbortSignal.timeout(25000),
  })
  if (!resposta.ok) throw new Error(`serper HTTP ${resposta.status}`)

  const dados = await resposta.json()
  const imagens = (dados.images ?? []).filter(
    (i) => i.imageUrl && (i.imageWidth ?? 0) >= 500 && (i.imageHeight ?? 0) >= 350
  )

  const dominio = (u) => {
    try {
      return new URL(u).hostname
    } catch {
      return ''
    }
  }

  const usaveis = imagens.filter((i) => !EVITAR.some((d) => dominio(i.imageUrl).includes(d)))
  const livres = usaveis.filter((i) => BANCOS_LIVRES.some((d) => dominio(i.imageUrl).includes(d)))

  // banco livre primeiro; o resto entra como reserva
  return [...livres, ...usaveis.filter((i) => !livres.includes(i))]
}

async function baixarERecortar(url) {
  const resposta = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'image/*',
    },
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
  })
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)

  const bytes = Buffer.from(await resposta.arrayBuffer())
  if (bytes.length < 8000) throw new Error('imagem pequena demais, provavelmente placeholder')

  return sharp(bytes)
    .resize(800, 600, { fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer()
}

let query = supabase.from('produtos').select('id, nome, imagem_url').order('nome')
if (SO_ESTE) query = query.eq('nome', SO_ESTE)
const { data: produtos } = await query

let trocadas = 0
const semFoto = []

for (const produto of produtos ?? []) {
  if (produto.imagem_url && !FORCAR && !SO_ESTE) continue

  const consultas = CONSULTAS[produto.nome] ?? [`${produto.nome} prato restaurante`]
  let sucesso = false

  for (const consulta of consultas) {
    let candidatos = []
    try {
      candidatos = await procurar(consulta)
    } catch (erro) {
      console.log(`  !!  ${produto.nome}: ${erro.message}`)
      continue
    }

    for (const candidato of candidatos.slice(0, 6)) {
      try {
        const imagem = await baixarERecortar(candidato.imageUrl)
        const caminho = `produtos/${produto.id}.webp`

        const { error } = await supabase.storage
          .from('cardapio')
          .upload(caminho, imagem, { contentType: 'image/webp', upsert: true })
        if (error) throw new Error(error.message)

        const { data } = supabase.storage.from('cardapio').getPublicUrl(caminho)
        await supabase
          .from('produtos')
          .update({ imagem_url: `${data.publicUrl}?v=${Date.now()}` })
          .eq('id', produto.id)

        const host = new URL(candidato.imageUrl).hostname.replace('www.', '')
        const livre = BANCOS_LIVRES.some((d) => host.includes(d)) ? 'livre' : 'web'
        console.log(`  ok  ${produto.nome.padEnd(30)} <- ${host} (${livre})`)
        trocadas++
        sucesso = true
        break
      } catch {
        // próximo candidato
      }
    }
    if (sucesso) break
  }

  if (!sucesso) {
    console.log(`  --  ${produto.nome.padEnd(30)} nenhuma imagem utilizável`)
    semFoto.push(produto.nome)
  }
}

console.log(`\n${trocadas} foto(s) atualizada(s), ${semFoto.length} sem foto`)
if (semFoto.length) for (const n of semFoto) console.log(`  - ${n}`)
