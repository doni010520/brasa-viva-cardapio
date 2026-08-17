'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conferirItens, type LinhaConferida } from '@/lib/montar-pedido'
import { criarClienteAdmin, exigirAdmin } from '@/lib/supabase/server'

type Resposta = { ok: true; numero: number; pedidoId: string } | { ok: false; erro: string }

const esquemaLancamento = z.object({
  // valor da balança, em centavos; 0 quando o lançamento é só de itens do cardápio
  quiloCentavos: z.coerce.number().int().min(0).max(5_000_00),
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid(),
        quantidade: z.number().int().min(1).max(99),
        opcaoIds: z.array(z.string().uuid()).max(30),
      })
    )
    .max(40),
  clienteNome: z.string().trim().max(80).optional(),
  metodo: z.enum(['pix', 'cartao', 'dinheiro']),
  observacoes: z.string().trim().max(300).optional(),
})

/**
 * Lançamento pelo balcão: a atendente digita o valor da balança (quilo) e,
 * se houver, itens do cardápio. O pedido nasce PAGO e RECEBIDO — o dinheiro
 * já passou pela maquininha/caixa antes de alguém tocar nesta tela.
 *
 * Itens do cardápio passam por conferirItens() como qualquer pedido: preço
 * do banco, regras dos grupos. Só o quilo é valor livre, e ele entra como
 * um item avulso do produto interno "Refeição no quilo".
 */
export async function lancarPedidoBalcaoAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquemaLancamento.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const dados = analise.data

  if (dados.quiloCentavos === 0 && dados.itens.length === 0) {
    return { ok: false, erro: 'Digite o valor do quilo ou adicione um item.' }
  }

  const supabase = criarClienteAdmin()

  // ------------------------------------------ itens do cardápio (preço do banco)
  let linhas: LinhaConferida[] = []
  if (dados.itens.length) {
    const conferencia = await conferirItens(dados.itens)
    if (!conferencia.ok) return { ok: false, erro: conferencia.erro }
    linhas = conferencia.linhas
  }

  // ------------------------------------------ o quilo (valor livre)
  if (dados.quiloCentavos > 0) {
    const { data: quilo } = await supabase
      .from('produtos')
      .select('id, nome')
      .eq('modo_consumo', 'interno')
      .eq('nome', 'Refeição no quilo')
      .maybeSingle()

    linhas.push({
      produto_id: quilo?.id ?? null,
      produto_nome: quilo?.nome ?? 'Refeição no quilo',
      quantidade: 1,
      preco_unit_centavos: dados.quiloCentavos,
      opcoes: [],
      observacao: null,
      total_centavos: dados.quiloCentavos,
    })
  }

  const subtotal = linhas.reduce((s, l) => s + l.total_centavos, 0)

  // ------------------------------------------ grava: já pago, já recebido
  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos')
    .insert({
      cliente_nome: dados.clienteNome || 'Cliente do balcão',
      // telefone é obrigatório no esquema; o balcão não tem — vai um marcador
      cliente_telefone: '00000000000',
      observacoes: dados.observacoes || null,
      subtotal_centavos: subtotal,
      desconto_centavos: 0,
      entrega_taxa_centavos: 0,
      total_centavos: subtotal,
      forma_pagamento: 'local',
      status_pagamento: 'pago',
      metodo_pagamento: dados.metodo,
      status: 'recebido',
      tipo_entrega: 'local',
      origem: 'balcao',
    })
    .select('id, numero')
    .single()

  if (erroPedido || !pedido) {
    console.error('[balcao] falha ao gravar o pedido', erroPedido)
    return { ok: false, erro: 'Não consegui registrar o lançamento. Tente de novo.' }
  }

  const { error: erroItens } = await supabase
    .from('pedido_itens')
    .insert(linhas.map((linha) => ({ ...linha, pedido_id: pedido.id })))

  if (erroItens) {
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    return { ok: false, erro: 'Não consegui registrar os itens. Tente de novo.' }
  }

  await supabase.from('pedido_eventos').insert({
    pedido_id: pedido.id,
    para: 'recebido',
    origem: 'admin',
  })

  // Imprime tudo, como o dono pediu: a comanda já entrou na fila pelo
  // gatilho do banco (status recebido); o recibo do cliente vai junto.
  await supabase.from('impressoes').insert({ pedido_id: pedido.id, via: 'recibo' })

  revalidatePath('/admin')
  return { ok: true, numero: pedido.numero, pedidoId: pedido.id }
}
