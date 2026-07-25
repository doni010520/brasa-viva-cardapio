import { criarClienteAdmin } from './supabase/server'
import type {
  Bairro,
  CategoriaComProdutos,
  Configuracoes,
  Horario,
  ModoConsumo,
  Pedido,
  PedidoItem,
  Produto,
} from './types'

/**
 * Leituras do cardápio e da loja. Rodam no servidor com service role — o
 * navegador nunca fala direto com o banco no lado do cliente.
 */

export async function buscarConfiguracoes(): Promise<Configuracoes> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('configuracoes').select('*').eq('id', 1).single()
  if (error) throw new Error(`Não consegui ler as configurações: ${error.message}`)
  return data as Configuracoes
}

export async function buscarBairros(incluirInativos = false): Promise<Bairro[]> {
  const supabase = criarClienteAdmin()
  const query = supabase.from('bairros_entrega').select('*').order('ordem').order('nome')
  if (!incluirInativos) query.eq('ativo', true)

  const { data, error } = await query
  if (error) throw new Error(`Não consegui ler os bairros: ${error.message}`)
  return (data ?? []) as Bairro[]
}

export async function buscarHorarios(): Promise<Horario[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('horarios').select('*').order('dia_semana')
  if (error) throw new Error(`Não consegui ler os horários: ${error.message}`)
  return (data ?? []) as Horario[]
}

/**
 * Cardápio completo com opções, na ordem definida pelo dono.
 *
 * `modo` filtra o que a pessoa pode pedir de onde ela está: buffet livre não
 * aparece para quem vai receber em casa, e marmita embalada não aparece para
 * quem está sentado no salão.
 */
export async function buscarCardapio(
  incluirInativos = false,
  modo?: ModoConsumo
): Promise<CategoriaComProdutos[]> {
  const supabase = criarClienteAdmin()

  const categoriasQuery = supabase.from('categorias').select('*').order('ordem')
  if (!incluirInativos) categoriasQuery.eq('ativo', true)

  const [{ data: categorias, error: erroCat }, { data: produtos, error: erroProd }] =
    await Promise.all([
      categoriasQuery,
      supabase
        .from('produtos')
        .select('*, grupos_opcoes(*, opcoes(*))')
        .order('ordem')
        .order('ordem', { referencedTable: 'grupos_opcoes' }),
    ])

  if (erroCat) throw new Error(`Não consegui ler as categorias: ${erroCat.message}`)
  if (erroProd) throw new Error(`Não consegui ler os produtos: ${erroProd.message}`)

  // 'ambos' passa sempre; os demais só no modo correspondente
  const cabeNoModo = (p: Produto) =>
    !modo ||
    p.modo_consumo === 'ambos' ||
    (modo === 'local' ? p.modo_consumo === 'so_local' : p.modo_consumo === 'so_viagem')

  const porCategoria = new Map<string, Produto[]>()
  for (const p of (produtos ?? []) as Produto[]) {
    if (!p.categoria_id) continue
    if (!cabeNoModo(p)) continue
    // as opções vêm sem ordem garantida no nível mais profundo
    p.grupos_opcoes = (p.grupos_opcoes ?? []).map((g) => ({
      ...g,
      opcoes: [...(g.opcoes ?? [])].sort((a, b) => a.ordem - b.ordem),
    }))
    const lista = porCategoria.get(p.categoria_id) ?? []
    lista.push(p)
    porCategoria.set(p.categoria_id, lista)
  }

  return ((categorias ?? []) as CategoriaComProdutos[])
    .map((c) => ({ ...c, produtos: porCategoria.get(c.id) ?? [] }))
    .filter((c) => incluirInativos || c.produtos.length > 0)
}

export async function buscarProduto(id: string): Promise<Produto | null> {
  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('produtos')
    .select('*, grupos_opcoes(*, opcoes(*))')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const produto = data as Produto
  produto.grupos_opcoes = (produto.grupos_opcoes ?? [])
    .sort((a, b) => a.ordem - b.ordem)
    .map((g) => ({ ...g, opcoes: [...(g.opcoes ?? [])].sort((a, b) => a.ordem - b.ordem) }))
  return produto
}

export async function buscarPedido(id: string): Promise<Pedido | null> {
  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('pedidos')
    .select('*, itens:pedido_itens(*)')
    .eq('id', id)
    .maybeSingle()
  return (data as Pedido) ?? null
}

export async function buscarPedidosDoPainel(status?: string[]): Promise<Pedido[]> {
  const supabase = criarClienteAdmin()
  let query = supabase
    .from('pedidos')
    .select('*, itens:pedido_itens(*)')
    .order('criado_em', { ascending: true })
    .limit(200)

  if (status?.length) query = query.in('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Não consegui ler os pedidos: ${error.message}`)
  return (data ?? []) as Pedido[]
}

export type { PedidoItem }
