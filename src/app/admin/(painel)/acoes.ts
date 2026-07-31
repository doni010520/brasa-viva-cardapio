'use server'

import { revalidatePath } from 'next/cache'
import { buscarConfiguracoes } from '@/lib/dados'
import { criarClienteAdmin, exigirAdmin } from '@/lib/supabase/server'
import { avisarMudancaDeStatus } from '@/lib/whatsapp'
import { STATUS_PEDIDO, type Pedido, type StatusPedido } from '@/lib/types'

type Resposta = { ok: true } | { ok: false; erro: string }

/**
 * Para onde cada status pode ir. Evita pedido "pronto" voltando para "recebido"
 * por um toque errado no meio do corre.
 */
const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  aguardando_pagamento: ['recebido', 'cancelado'],
  recebido: ['em_preparo', 'pronto', 'cancelado'],
  em_preparo: ['pronto', 'recebido', 'cancelado'],
  pronto: ['saiu_para_entrega', 'retirado', 'em_preparo'],
  saiu_para_entrega: ['retirado', 'pronto'],
  retirado: [],
  cancelado: [],
}

export async function mudarStatusAction(
  pedidoId: string,
  novoStatus: StatusPedido
): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  if (!STATUS_PEDIDO.includes(novoStatus)) {
    return { ok: false, erro: 'Status inválido.' }
  }

  const supabase = criarClienteAdmin()
  const { data } = await supabase.from('pedidos').select('*').eq('id', pedidoId).maybeSingle()
  if (!data) return { ok: false, erro: 'Pedido não encontrado.' }

  const pedido = data as Pedido
  const atual = pedido.status

  if (!TRANSICOES[atual].includes(novoStatus)) {
    return { ok: false, erro: `Não dá para ir de "${atual}" para "${novoStatus}".` }
  }
  if (novoStatus === 'saiu_para_entrega' && pedido.tipo_entrega !== 'entrega') {
    return { ok: false, erro: 'Este pedido é para retirada no balcão.' }
  }

  const { error } = await supabase
    .from('pedidos')
    .update({ status: novoStatus })
    .eq('id', pedidoId)

  if (error) return { ok: false, erro: 'Não consegui salvar. Tente de novo.' }

  await supabase.from('pedido_eventos').insert({
    pedido_id: pedidoId,
    de: atual,
    para: novoStatus,
    origem: 'admin',
  })

  // aviso é bônus: falha no WhatsApp não desfaz a mudança de status
  try {
    const config = await buscarConfiguracoes()
    await avisarMudancaDeStatus(pedido, novoStatus, config.nome)
  } catch (erro) {
    console.warn('[admin] não consegui avisar o cliente no WhatsApp', erro)
  }

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * Manda a comanda para a fila de novo.
 *
 * Papel amassado, impressora sem tinta, alguém perdeu o cupom — acontece
 * todo dia. Vira um trabalho novo na fila; o agente pega no próximo giro.
 */
export async function reimprimirAction(pedidoId: string): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const supabase = criarClienteAdmin()

  // a reimpressão sai na mesma impressora da comanda original
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('tipo_entrega')
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const via = pedido.tipo_entrega === 'local' ? 'salao' : 'viagem'
  const { error } = await supabase
    .from('impressoes')
    .insert({ pedido_id: pedidoId, via })

  if (error) return { ok: false, erro: 'Não consegui enfileirar a impressão.' }

  revalidatePath('/admin')
  return { ok: true }
}

/** Chave geral: fecha a loja na hora, mesmo dentro do horário. */
export async function alternarLojaAction(aberta: boolean): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase
    .from('configuracoes')
    .update({ aberto_manual: aberta })
    .eq('id', 1)

  if (error) return { ok: false, erro: 'Não consegui salvar.' }

  revalidatePath('/admin')
  revalidatePath('/')
  return { ok: true }
}
