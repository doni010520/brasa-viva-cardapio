/**
 * Troca a foto de um produto por uma imagem do computador.
 *
 * Serve para quando o dono manda fotos reais dos pratos: mais rápido do que
 * abrir o painel e subir uma a uma. O painel continua funcionando igual — isto
 * é só um atalho para quem tem acesso ao terminal.
 *
 * Uso:
 *   node scripts/foto-do-produto.mjs "Marmita do dia" "C:/fotos/marmita.jpg"
 *
 * Para listar os nomes exatos dos produtos:
 *   node scripts/foto-do-produto.mjs --listar
 */
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { env } from './credenciais.mjs'

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

if (process.argv.includes('--listar')) {
  const { data } = await supabase
    .from('produtos')
    .select('nome, imagem_url, categorias(nome)')
    .order('nome')

  console.log('\nProdutos no cardápio:\n')
  for (const p of data ?? []) {
    const cat = p.categorias?.nome ?? 'sem categoria'
    console.log(`  ${p.imagem_url ? '📷' : '  '} ${p.nome.padEnd(32)} (${cat})`)
  }
  process.exit(0)
}

const [nomeProduto, caminhoFoto] = process.argv.slice(2)
if (!nomeProduto || !caminhoFoto) {
  console.error('Uso: node scripts/foto-do-produto.mjs "Nome do Produto" "caminho/da/foto.jpg"')
  console.error('     node scripts/foto-do-produto.mjs --listar')
  process.exit(1)
}

const { data: produto } = await supabase
  .from('produtos')
  .select('id, nome')
  .ilike('nome', nomeProduto)
  .maybeSingle()

if (!produto) {
  console.error(`Não achei o produto "${nomeProduto}". Rode com --listar para ver os nomes.`)
  process.exit(1)
}

const original = await sharp(caminhoFoto).metadata()

// 800x600 cobre o card e o topo do modal. Não amplia além da origem: foto de
// celular esticada fica borrada e aparece feio no cardápio.
const largura = Math.min(800, original.width ?? 800)
const imagem = await sharp(caminhoFoto)
  .resize(largura, Math.round(largura * 0.75), { fit: 'cover', position: 'attention' })
  .webp({ quality: 84 })
  .toBuffer()

const caminho = `produtos/${produto.id}.webp`
const { error } = await supabase.storage
  .from('cardapio')
  .upload(caminho, imagem, { contentType: 'image/webp', upsert: true })

if (error) {
  console.error('Não consegui subir a imagem:', error.message)
  process.exit(1)
}

const { data: publico } = supabase.storage.from('cardapio').getPublicUrl(caminho)
await supabase
  .from('produtos')
  // o ?v= força o navegador a buscar a nova em vez de mostrar a antiga do cache
  .update({ imagem_url: `${publico.publicUrl}?v=${Date.now()}` })
  .eq('id', produto.id)

console.log(`foto trocada: ${produto.nome}`)
console.log(`  origem: ${original.width}x${original.height} -> publicada em ${largura}px`)
