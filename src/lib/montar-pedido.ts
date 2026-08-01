import { criarClienteAdmin } from './supabase/server'
import type { GrupoOpcoes, OpcaoEscolhida, Produto, SecaoOpcoes } from './types'

export type ItemEnviado = {
  produtoId: string
  quantidade: number
  opcaoIds: string[]
  observacao?: string
}

export type LinhaConferida = {
  produto_id: string
  produto_nome: string
  quantidade: number
  preco_unit_centavos: number
  opcoes: OpcaoEscolhida[]
  observacao: string | null
  total_centavos: number
}

export type ConferenciaOk = { ok: true; linhas: LinhaConferida[]; subtotalCentavos: number }
export type ConferenciaErro = { ok: false; erro: string }

/**
 * Recalcula o pedido inteiro a partir do banco.
 *
 * O navegador manda apenas O QUE foi escolhido (ids), nunca quanto custa.
 * Preço, disponibilidade e as regras de cada grupo de opções são conferidos
 * aqui — é o que impede alguém de forjar um pedido de R$ 0,01.
 */
export async function conferirItens(itens: ItemEnviado[]): Promise<ConferenciaOk | ConferenciaErro> {
  if (!itens.length) return { ok: false, erro: 'Seu carrinho está vazio.' }

  const supabase = criarClienteAdmin()
  const ids = [...new Set(itens.map((i) => i.produtoId))]

  const { data, error } = await supabase
    .from('produtos')
    .select('*, grupos_opcoes(*, opcoes(*)), secoes_opcoes(*)')
    .in('id', ids)

  if (error) return { ok: false, erro: 'Não consegui conferir o cardápio agora.' }

  const catalogo = new Map((data as Produto[]).map((p) => [p.id, p]))
  const linhas: LinhaConferida[] = []

  for (const item of itens) {
    const produto = catalogo.get(item.produtoId)
    if (!produto) return { ok: false, erro: 'Um dos itens saiu do cardápio. Revise o carrinho.' }
    if (!produto.disponivel) return { ok: false, erro: `"${produto.nome}" acabou por hoje.` }

    const quantidade = Math.trunc(item.quantidade)
    if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 99) {
      return { ok: false, erro: `Quantidade inválida em "${produto.nome}".` }
    }

    const grupos: GrupoOpcoes[] = produto.grupos_opcoes ?? []
    // id repetido no envio = quantidade ("3x Fraldinha" chega como 3 ids iguais)
    const contagem = new Map<string, number>()
    for (const id of item.opcaoIds) contagem.set(id, (contagem.get(id) ?? 0) + 1)
    const opcoes: OpcaoEscolhida[] = []
    let extras = 0

    for (const grupo of grupos) {
      const doGrupo = grupo.opcoes.filter((o) => contagem.has(o.id))
      const totalDoGrupo = doGrupo.reduce((s, o) => s + (contagem.get(o.id) ?? 0), 0)

      if (totalDoGrupo < grupo.min_escolhas) {
        return { ok: false, erro: `Em "${produto.nome}", escolha: ${grupo.nome}.` }
      }
      if (totalDoGrupo > grupo.max_escolhas) {
        return {
          ok: false,
          erro: `Em "${produto.nome}", "${grupo.nome}" aceita no máximo ${grupo.max_escolhas}.`,
        }
      }

      for (const opcao of doGrupo) {
        const vezes = contagem.get(opcao.id) ?? 0
        if (!grupo.permite_repetir && vezes > 1) {
          return {
            ok: false,
            erro: `Em "${produto.nome}", "${grupo.nome}" não aceita repetir a mesma opção.`,
          }
        }
        if (!opcao.disponivel) {
          return { ok: false, erro: `"${opcao.nome}" acabou. Ajuste "${produto.nome}".` }
        }
        opcoes.push({
          id: opcao.id,
          grupo: grupo.nome,
          nome: opcao.nome,
          preco_extra_centavos: opcao.preco_extra_centavos,
          ...(vezes > 1 ? { quantidade: vezes } : {}),
        })
        extras += opcao.preco_extra_centavos * vezes
      }
    }

    // ids que não pertencem a nenhum grupo deste produto
    const validos = new Set(grupos.flatMap((g) => g.opcoes.map((o) => o.id)))
    if (item.opcaoIds.some((id) => !validos.has(id))) {
      return { ok: false, erro: `Opção inválida em "${produto.nome}".` }
    }

    // Regra da seção: o total escolhido no CONJUNTO de grupos dela.
    // É o que impede o marmitex de sair sem carne — ou com quatro.
    const secoes: SecaoOpcoes[] = produto.secoes_opcoes ?? []
    for (const secao of secoes) {
      const total = grupos
        .filter((g) => g.secao_id === secao.id)
        .reduce(
          (soma, g) => soma + g.opcoes.reduce((s, o) => s + (contagem.get(o.id) ?? 0), 0),
          0
        )

      if (total < secao.min_escolhas) {
        return {
          ok: false,
          erro: `Em "${produto.nome}", escolha pelo menos ${secao.min_escolhas} em "${secao.nome}".`,
        }
      }
      if (total > secao.max_escolhas) {
        return {
          ok: false,
          erro: `Em "${produto.nome}", "${secao.nome}" aceita no máximo ${secao.max_escolhas} no total.`,
        }
      }
    }

    const base =
      produto.preco_promo_centavos !== null &&
      produto.preco_promo_centavos < produto.preco_centavos
        ? produto.preco_promo_centavos
        : produto.preco_centavos

    const unitario = base + extras

    linhas.push({
      produto_id: produto.id,
      produto_nome: produto.nome,
      quantidade,
      preco_unit_centavos: unitario,
      opcoes,
      observacao: item.observacao?.trim().slice(0, 200) || null,
      total_centavos: unitario * quantidade,
    })
  }

  return {
    ok: true,
    linhas,
    subtotalCentavos: linhas.reduce((s, l) => s + l.total_centavos, 0),
  }
}
