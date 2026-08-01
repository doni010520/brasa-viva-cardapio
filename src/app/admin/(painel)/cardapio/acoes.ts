'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { criarClienteAdmin, exigirAdmin, exigirDono } from '@/lib/supabase/server'

type Resposta<T = undefined> = { ok: true; dados?: T } | { ok: false; erro: string }

/**
 * Mexer no cardápio é coisa de dono: preço, foto, o que existe e o que não
 * existe. O atendente só pode marcar item como esgotado (ver mais abaixo).
 */
async function garantirDono(): Promise<string | null> {
  try {
    await exigirDono()
    return null
  } catch (erro) {
    return erro instanceof Error && erro.message.includes('Só o dono')
      ? 'Só o dono pode mexer no cardápio.'
      : 'Sessão expirada. Entre de novo no painel.'
  }
}

/** Para o que qualquer pessoa da equipe pode fazer. */
async function garantirEquipe(): Promise<string | null> {
  try {
    await exigirAdmin()
    return null
  } catch {
    return 'Sessão expirada. Entre de novo no painel.'
  }
}

function atualizarTelas() {
  revalidatePath('/admin/cardapio')
  revalidatePath('/')
}

// ---------------------------------------------------------------- categorias

const esquemaCategoria = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2, 'Dê um nome à categoria.').max(60),
  descricao: z.string().trim().max(160).optional(),
  ordem: z.coerce.number().int().min(0).max(999),
  ativo: z.boolean(),
})

export async function salvarCategoriaAction(entrada: unknown): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaCategoria.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data
  const registro = { ...campos, descricao: campos.descricao || null }

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('categorias').update(registro).eq('id', id)
    : await supabase.from('categorias').insert(registro)

  if (error) return { ok: false, erro: 'Não consegui salvar a categoria.' }

  atualizarTelas()
  return { ok: true }
}

export async function excluirCategoriaAction(id: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { count } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', id)

  if (count && count > 0) {
    return {
      ok: false,
      erro: `Esta categoria tem ${count} produto(s). Mova ou apague os produtos antes.`,
    }
  }

  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar a categoria.' }

  atualizarTelas()
  return { ok: true }
}

// ----------------------------------------------------------------- produtos

const esquemaProduto = z.object({
  id: z.string().uuid().optional(),
  categoria_id: z.string().uuid('Escolha uma categoria.'),
  nome: z.string().trim().min(2, 'Dê um nome ao produto.').max(80),
  descricao: z.string().trim().max(300).optional(),
  preco_centavos: z.coerce.number().int().min(0, 'Preço inválido.').max(10_000_00),
  preco_promo_centavos: z.coerce.number().int().min(0).max(10_000_00).nullable().optional(),
  imagem_url: z.string().trim().max(500).nullable().optional(),
  disponivel: z.boolean(),
  destaque: z.boolean(),
  ordem: z.coerce.number().int().min(0).max(999),
  /**
   * Em qual dos dois cardápios o item aparece.
   *
   * São cardápios diferentes de verdade: buffet livre só existe para quem
   * está sentado no salão, e marmita embalada só faz sentido para quem vai
   * levar. Oferecer o item errado dá pedido que a casa não consegue entregar.
   */
  modo_consumo: z.enum(['ambos', 'so_local', 'so_viagem']),
})

export async function salvarProdutoAction(entrada: unknown): Promise<Resposta<{ id: string }>> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaProduto.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data

  if (campos.preco_promo_centavos && campos.preco_promo_centavos >= campos.preco_centavos) {
    return { ok: false, erro: 'O preço promocional precisa ser menor que o preço normal.' }
  }

  const registro = {
    ...campos,
    descricao: campos.descricao || null,
    preco_promo_centavos: campos.preco_promo_centavos || null,
    imagem_url: campos.imagem_url || null,
  }

  const supabase = criarClienteAdmin()
  const { data, error } = id
    ? await supabase.from('produtos').update(registro).eq('id', id).select('id').single()
    : await supabase.from('produtos').insert(registro).select('id').single()

  if (error || !data) return { ok: false, erro: 'Não consegui salvar o produto.' }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${data.id}`)
  return { ok: true, dados: { id: data.id as string } }
}

/**
 * O botão de "esgotou" — o mais usado no dia a dia, e a ÚNICA coisa do
 * cardápio que o atendente pode fazer. Acabou a picanha às 13h: quem está
 * no balcão tira do ar na hora, sem depender do dono.
 */
export async function alternarDisponibilidadeAction(
  id: string,
  disponivel: boolean
): Promise<Resposta> {
  const bloqueio = await garantirEquipe()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('produtos').update({ disponivel }).eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui atualizar.' }

  atualizarTelas()
  return { ok: true }
}

export async function excluirProdutoAction(id: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar o produto.' }

  atualizarTelas()
  return { ok: true }
}

// ------------------------------------------------------- grupos e opções

const esquemaGrupo = z.object({
  id: z.string().uuid().optional(),
  produto_id: z.string().uuid(),
  nome: z.string().trim().min(2, 'Dê um nome ao grupo.').max(60),
  min_escolhas: z.coerce.number().int().min(0).max(20),
  max_escolhas: z.coerce.number().int().min(1).max(20),
  ordem: z.coerce.number().int().min(0).max(99),
})

export async function salvarGrupoAction(entrada: unknown): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaGrupo.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data

  if (campos.min_escolhas > campos.max_escolhas) {
    return { ok: false, erro: 'O mínimo não pode ser maior que o máximo.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('grupos_opcoes').update(campos).eq('id', id)
    : await supabase.from('grupos_opcoes').insert(campos)

  if (error) return { ok: false, erro: 'Não consegui salvar o grupo de opções.' }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${campos.produto_id}`)
  return { ok: true }
}

const esquemaReordenacao = z.object({
  produto_id: z.string().uuid(),
  // a ordem final, do primeiro ao último grupo
  ids: z.array(z.string().uuid()).min(1).max(40),
})

/** Recebe os grupos já na ordem desejada (arrasto ou setinhas do painel). */
export async function reordenarGruposAction(entrada: unknown): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaReordenacao.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: 'Não entendi a nova ordem dos grupos.' }
  }
  const { produto_id, ids } = analise.data

  const supabase = criarClienteAdmin()

  // só reordena o que é deste produto: id de fora da lista é ignorado
  const { data: donos } = await supabase
    .from('grupos_opcoes')
    .select('id')
    .eq('produto_id', produto_id)
  const validos = new Set((donos ?? []).map((g) => g.id))

  for (const [indice, id] of ids.entries()) {
    if (!validos.has(id)) continue
    const { error } = await supabase
      .from('grupos_opcoes')
      .update({ ordem: indice + 1 })
      .eq('id', id)
    if (error) return { ok: false, erro: 'Não consegui salvar a nova ordem.' }
  }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${produto_id}`)
  return { ok: true }
}

export async function excluirGrupoAction(id: string, produtoId: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('grupos_opcoes').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar o grupo.' }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${produtoId}`)
  return { ok: true }
}

const esquemaOpcao = z.object({
  id: z.string().uuid().optional(),
  grupo_id: z.string().uuid(),
  nome: z.string().trim().min(1, 'Dê um nome à opção.').max(60),
  preco_extra_centavos: z.coerce.number().int().min(0).max(10_000_00),
  disponivel: z.boolean(),
  ordem: z.coerce.number().int().min(0).max(99),
})

export async function salvarOpcaoAction(
  entrada: unknown,
  produtoId: string
): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaOpcao.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('opcoes').update(campos).eq('id', id)
    : await supabase.from('opcoes').insert(campos)

  if (error) return { ok: false, erro: 'Não consegui salvar a opção.' }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${produtoId}`)
  return { ok: true }
}

export async function excluirOpcaoAction(id: string, produtoId: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('opcoes').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar a opção.' }

  atualizarTelas()
  revalidatePath(`/admin/cardapio/${produtoId}`)
  return { ok: true }
}

// -------------------------------------------------------------- imagens

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const TAMANHO_MAXIMO = 5 * 1024 * 1024

/** Sobe a foto do prato para o Storage e devolve a URL pública. */
export async function enviarImagemAction(formulario: FormData): Promise<Resposta<{ url: string }>> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const arquivo = formulario.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: 'Escolha uma imagem.' }
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return { ok: false, erro: 'Use uma imagem JPG, PNG, WEBP ou AVIF.' }
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: 'A imagem passa de 5 MB. Escolha uma menor.' }
  }

  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const caminho = `produtos/${crypto.randomUUID()}.${extensao}`

  const supabase = criarClienteAdmin()
  const { error } = await supabase.storage
    .from('cardapio')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })

  if (error) return { ok: false, erro: `Não consegui subir a imagem: ${error.message}` }

  const { data } = supabase.storage.from('cardapio').getPublicUrl(caminho)
  return { ok: true, dados: { url: data.publicUrl } }
}
