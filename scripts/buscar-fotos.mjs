/**
 * Busca fotos de placeholder para o cardápio no Openverse, recorta,
 * sobe para o Storage do Supabase e liga em cada produto.
 *
 * Só usa imagens CC0 / domínio público: uso comercial liberado e sem
 * obrigação de dar crédito. Nada de Google Imagens — aquilo é material
 * de terceiros com direito autoral, e este site é de um negócio real.
 *
 * São fotos PROVISÓRIAS. O dono troca cada uma pelo prato de verdade
 * direto no painel, em Cardápio > produto > Foto do prato.
 *
 * Uso:  node scripts/buscar-fotos.mjs [--forcar]
 *       --forcar  refaz também os produtos que já têm foto
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const FORCAR = process.argv.includes('--forcar')

/**
 * Consultas em inglês (o acervo é indexado em inglês), da mais específica
 * para a mais genérica. A primeira que devolver imagem boa vence.
 */
const CONSULTAS = {
  'Espeto de picanha': ['picanha steak grilled', 'beef skewer barbecue', 'grilled beef'],
  'Espeto de alcatra': ['beef skewer grill', 'sirloin steak grilled', 'grilled beef'],
  'Espeto de linguiça': ['grilled sausage skewer', 'grilled sausage', 'barbecue sausage'],
  'Espeto de frango com bacon': ['chicken bacon skewer', 'grilled chicken skewer', 'chicken kebab'],
  'Espeto de coração': ['grilled chicken hearts', 'meat skewer grill', 'barbecue skewer'],
  'Espeto de queijo coalho': ['grilled cheese skewer', 'halloumi grilled', 'cheese skewer'],

  'Churrasco misto': ['brazilian barbecue plate', 'mixed grill plate', 'barbecue meat plate'],
  'Picanha na chapa': ['picanha steak sliced', 'sliced steak platter', 'steak', 'grilled meat'],
  'Costela no bafo': ['beef ribs barbecue', 'slow cooked ribs', 'barbecue ribs'],
  'Marmita executiva': ['rice beans meat plate', 'lunch plate', 'dinner plate food', 'meal plate'],

  'Porção de picanha': ['sliced picanha platter', 'sliced beef platter', 'steak', 'roast beef'],
  'Porção de linguiça': ['sliced grilled sausage', 'grilled sausage', 'sausage platter'],
  'Porção de mandioca frita': ['fried cassava', 'fried yuca', 'french fries', 'fried potatoes'],
  'Porção de calabresa acebolada': ['sausage with onions', 'fried sausage onion', 'grilled sausage'],

  'Arroz branco': ['white rice bowl', 'steamed rice', 'cooked rice'],
  'Feijão tropeiro': ['brazilian beans dish', 'beans with bacon', 'cooked beans'],
  'Farofa da casa': ['farofa cassava flour', 'toasted cassava flour', 'couscous bowl', 'side dish bowl'],
  Vinagrete: ['tomato onion salsa', 'fresh tomato salad', 'chopped salad'],
  'Pão de alho': ['garlic bread grilled', 'garlic bread', 'grilled bread'],

  'Refrigerante lata 350ml': ['soda can', 'soft drink can', 'beverage can'],
  'Cerveja long neck 355ml': ['beer bottle cold', 'beer bottle', 'bottled beer'],
  'Suco natural 500ml': ['orange juice glass', 'fresh fruit juice', 'juice glass'],
  'Água de coco 300ml': ['coconut water', 'fresh coconut drink', 'coconut'],
  'Água mineral 500ml': ['water bottle mineral', 'bottled water', 'water bottle'],

  'Cocada baiana': ['coconut candy sweet', 'coconut dessert', 'coconut sweet'],
  'Pudim de leite': ['flan caramel dessert', 'creme caramel', 'pudding dessert'],
  'Abacaxi na brasa': ['grilled pineapple', 'pineapple slices grilled', 'pineapple dessert'],
}

async function procurar(consulta) {
  const url =
    'https://api.openverse.org/v1/images/?' +
    new URLSearchParams({
      q: consulta,
      page_size: '8',
      license: 'cc0,pdm',
      mature: 'false',
      // evita ilustração/clipart, queremos fotografia
      category: 'photograph',
    })

  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'cardapio-brasa-viva/1.0' },
    signal: AbortSignal.timeout(25000),
  })
  if (!resposta.ok) return []

  const dados = await resposta.json()
  return (dados.results ?? []).filter((r) => r.url && (r.width ?? 0) >= 600)
}

async function baixarERecortar(urlImagem) {
  const resposta = await fetch(urlImagem, {
    headers: { 'User-Agent': 'cardapio-brasa-viva/1.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)

  const bytes = Buffer.from(await resposta.arrayBuffer())

  // 800x600 é o suficiente para o card e para o topo do modal
  return sharp(bytes)
    .resize(800, 600, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
    .toBuffer()
}

const { data: produtos } = await supabase
  .from('produtos')
  .select('id, nome, imagem_url')
  .order('nome')

let colocadas = 0
let puladas = 0
const semFoto = []

for (const produto of produtos ?? []) {
  if (produto.imagem_url && !FORCAR) {
    puladas++
    continue
  }

  const consultas = CONSULTAS[produto.nome] ?? [produto.nome]
  let sucesso = false

  for (const consulta of consultas) {
    let candidatos
    try {
      candidatos = await procurar(consulta)
    } catch {
      continue
    }
    if (!candidatos.length) continue

    for (const candidato of candidatos.slice(0, 3)) {
      try {
        const imagem = await baixarERecortar(candidato.url)
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

        console.log(
          `  ok  ${produto.nome.padEnd(30)} <- "${consulta}" (${candidato.license})`
        )
        colocadas++
        sucesso = true
        break
      } catch {
        // tenta o próximo candidato
      }
    }
    if (sucesso) break
  }

  if (!sucesso) {
    console.log(`  --  ${produto.nome.padEnd(30)} sem foto boa`)
    semFoto.push(produto.nome)
  }
}

console.log(`\n${colocadas} fotos colocadas, ${puladas} já tinham, ${semFoto.length} sem foto`)
if (semFoto.length) {
  console.log('Sem foto (o dono coloca a real pelo painel):')
  for (const nome of semFoto) console.log(`  - ${nome}`)
}
