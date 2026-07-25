'use server'

import { z } from 'zod'
import { buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { consumirCupom, validarCupom } from '@/lib/cupons'
import { conferirItens, type ItemEnviado } from '@/lib/montar-pedido'
import { criarPreferencia, mercadoPagoConfigurado, urlBase } from '@/lib/mercadopago'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { estadoDaLoja } from '@/lib/tempo'
import { apenasDigitos } from '@/lib/format'
import { avisarPedidoConfirmado } from '@/lib/whatsapp'
import type { Bairro } from '@/lib/types'

const esquemaItem = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().int().min(1).max(99),
  opcaoIds: z.array(z.string().uuid()).max(30),
  observacao: z.string().max(200).optional(),
})

const esquemaPedido = z.object({
  nome: z.string().trim().min(2, 'Diga seu nome.').max(80),
  telefone: z.string().trim().min(10, 'Telefone incompleto.').max(20),
  observacoes: z.string().trim().max(300).optional(),
  formaPagamento: z.enum(['online', 'local']),
  tipoEntrega: z.enum(['retirada', 'entrega']),
  retiradaPrevista: z.string().datetime().nullable().optional(),
  cupom: z.string().trim().max(30).optional(),
  itens: z.array(esquemaItem).min(1, 'Seu carrinho está vazio.').max(60),
  // só usados quando tipoEntrega = 'entrega'
  bairroId: z.string().uuid().nullable().optional(),
  enderecoRua: z.string().trim().max(120).optional(),
  enderecoNumero: z.string().trim().max(20).optional(),
  enderecoComplemento: z.string().trim().max(80).optional(),
  enderecoReferencia: z.string().trim().max(120).optional(),
})

export type RespostaCheckout =
  | { ok: true; pedidoId: string; destino: string; externo: boolean }
  | { ok: false; erro: string }

/** Confere um cupom sem criar pedido — usado no botão "Aplicar" do checkout. */
export async function conferirCupomAction(
  codigo: string,
  itens: ItemEnviado[]
): Promise<{ ok: true; descontoCentavos: number; codigo: string } | { ok: false; erro: string }> {
  const conferencia = await conferirItens(itens)
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro }

  const resultado = await validarCupom(codigo, conferencia.subtotalCentavos)
  if (!resultado.ok) return { ok: false, erro: resultado.erro }

  return {
    ok: true,
    descontoCentavos: resultado.descontoCentavos,
    codigo: resultado.cupom.codigo,
  }
}

export async function criarPedidoAction(entrada: unknown): Promise<RespostaCheckout> {
  const analise = esquemaPedido.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Confira os dados do pedido.' }
  }
  const dados = analise.data

  const [config, horarios] = await Promise.all([buscarConfiguracoes(), buscarHorarios()])

  const loja = estadoDaLoja(config, horarios)
  if (!loja.aberta) {
    return { ok: false, erro: `Não dá para fechar o pedido agora. ${loja.motivo}` }
  }

  if (apenasDigitos(dados.telefone).length < 10) {
    return { ok: false, erro: 'Telefone inválido. Use DDD + número.' }
  }

  // ---------------------------------------------------- forma de entrega
  const ehEntrega = dados.tipoEntrega === 'entrega'
  if (ehEntrega && !config.aceita_entrega) {
    return { ok: false, erro: 'No momento não estamos entregando, só retirada.' }
  }
  if (!ehEntrega && !config.aceita_retirada) {
    return { ok: false, erro: 'No momento só trabalhamos com entrega.' }
  }

  let bairro: Bairro | null = null
  if (ehEntrega) {
    if (!dados.bairroId) return { ok: false, erro: 'Escolha o bairro da entrega.' }
    if (!dados.enderecoRua || !dados.enderecoNumero) {
      return { ok: false, erro: 'Informe rua e número para a entrega.' }
    }

    const supabase = criarClienteAdmin()
    const { data } = await supabase
      .from('bairros_entrega')
      .select('*')
      .eq('id', dados.bairroId)
      .eq('ativo', true)
      .maybeSingle()

    if (!data) return { ok: false, erro: 'Ainda não entregamos nesse bairro.' }
    bairro = data as Bairro
  }

  // ---------------------------------------------------- forma de pagamento
  if (dados.formaPagamento === 'online' && !config.aceita_pagamento_online) {
    return { ok: false, erro: 'Pagamento online indisponível no momento.' }
  }
  if (dados.formaPagamento === 'local' && !config.aceita_pagamento_local) {
    return { ok: false, erro: 'No momento só aceitamos pagamento online.' }
  }
  if (dados.formaPagamento === 'online' && !mercadoPagoConfigurado()) {
    return {
      ok: false,
      erro: 'O pagamento online ainda não foi configurado. Escolha pagar na entrega/retirada.',
    }
  }

  // ------------------------------------------- preços saem do banco, não do navegador
  const conferencia = await conferirItens(dados.itens)
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro }
  const { linhas, subtotalCentavos } = conferencia

  if (subtotalCentavos < config.pedido_minimo_centavos) {
    const minimo = (config.pedido_minimo_centavos / 100).toFixed(2).replace('.', ',')
    return { ok: false, erro: `O pedido mínimo é R$ ${minimo}.` }
  }

  let descontoCentavos = 0
  let cupomCodigo: string | null = null
  if (dados.cupom) {
    const resultado = await validarCupom(dados.cupom, subtotalCentavos)
    if (!resultado.ok) return { ok: false, erro: resultado.erro }
    descontoCentavos = resultado.descontoCentavos
    cupomCodigo = resultado.cupom.codigo
  }

  const taxaCentavos = bairro ? calcularTaxa(bairro, subtotalCentavos, config) : 0
  const totalCentavos = Math.max(0, subtotalCentavos - descontoCentavos) + taxaCentavos
  const pagoDepois = dados.formaPagamento === 'local'

  // ------------------------------------------------------------- grava
  const supabase = criarClienteAdmin()
  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos')
    .insert({
      cliente_nome: dados.nome,
      cliente_telefone: dados.telefone,
      observacoes: dados.observacoes || null,
      subtotal_centavos: subtotalCentavos,
      desconto_centavos: descontoCentavos,
      entrega_taxa_centavos: taxaCentavos,
      total_centavos: totalCentavos,
      cupom_codigo: cupomCodigo,
      forma_pagamento: dados.formaPagamento,
      status_pagamento: 'pendente',
      status: pagoDepois ? 'recebido' : 'aguardando_pagamento',
      retirada_prevista: dados.retiradaPrevista ?? null,
      tipo_entrega: dados.tipoEntrega,
      bairro_id: bairro?.id ?? null,
      endereco_rua: ehEntrega ? dados.enderecoRua : null,
      endereco_numero: ehEntrega ? dados.enderecoNumero : null,
      endereco_complemento: ehEntrega ? dados.enderecoComplemento || null : null,
      endereco_bairro: bairro?.nome ?? null,
      endereco_referencia: ehEntrega ? dados.enderecoReferencia || null : null,
    })
    .select('*')
    .single()

  if (erroPedido || !pedido) {
    console.error('[checkout] falha ao gravar o pedido', erroPedido)
    return { ok: false, erro: 'Não consegui registrar seu pedido. Tente de novo.' }
  }

  const { error: erroItens } = await supabase
    .from('pedido_itens')
    .insert(linhas.map((linha) => ({ ...linha, pedido_id: pedido.id })))

  if (erroItens) {
    // pedido sem itens é lixo no painel da cozinha
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    return { ok: false, erro: 'Não consegui registrar os itens. Tente de novo.' }
  }

  await supabase.from('pedido_eventos').insert({
    pedido_id: pedido.id,
    para: pagoDepois ? 'recebido' : 'aguardando_pagamento',
    origem: 'sistema',
  })

  // ------------------------------------------------------------ segue o fluxo
  if (pagoDepois) {
    await consumirCupom(cupomCodigo)

    const base = await urlBase()
    // aviso é bônus: se o WhatsApp falhar, o pedido continua valendo
    await avisarPedidoConfirmado(pedido, config.nome, `${base}/pedido/${pedido.id}`)

    return { ok: true, pedidoId: pedido.id, destino: `/pedido/${pedido.id}`, externo: false }
  }

  try {
    const { preferenceId, urlPagamento } = await criarPreferencia({
      id: pedido.id,
      numero: pedido.numero,
      totalCentavos,
      clienteNome: dados.nome,
      clienteTelefone: dados.telefone,
      descricaoItens: linhas.map((l) => `${l.quantidade}x ${l.produto_nome}`).join(', '),
      nomeLoja: config.nome,
    })

    await supabase.from('pedidos').update({ mp_preference_id: preferenceId }).eq('id', pedido.id)
    return { ok: true, pedidoId: pedido.id, destino: urlPagamento, externo: true }
  } catch (erro) {
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    console.error('[checkout] falha ao criar preferência do Mercado Pago', erro)
    return {
      ok: false,
      erro: 'Não consegui abrir o pagamento. Tente de novo ou escolha pagar na entrega/retirada.',
    }
  }
}

/** Taxa do bairro, já considerando a isenção por valor do pedido. */
function calcularTaxa(
  bairro: Bairro,
  subtotalCentavos: number,
  config: { entrega_gratis_acima_centavos: number | null }
) {
  const isenta =
    config.entrega_gratis_acima_centavos !== null &&
    config.entrega_gratis_acima_centavos > 0 &&
    subtotalCentavos >= config.entrega_gratis_acima_centavos

  return isenta ? 0 : bairro.taxa_centavos
}
