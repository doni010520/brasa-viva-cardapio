import { consumirCupom } from './cupons'
import { buscarConfiguracoes } from './dados'
import { conferirPagamentoInfinitePay } from './infinitepay'
import { criarClienteAdmin } from './supabase/server'
import type { Pedido } from './types'
import { urlBase } from './url'
import { avisarPedidoConfirmado } from './whatsapp'

export type ResultadoConfirmacao =
  | 'pago'
  | 'ja-estava-pago'
  | 'nao-pago'
  | 'divergente'
  | 'falha-consulta'

/**
 * Confirma um pagamento InfinitePay e libera o pedido para a cozinha.
 *
 * É chamado de DOIS lugares, e isso é decisão de desenho: pelo webhook
 * (garantia) e pela volta do cliente ao site, que traz transaction_nsu e
 * slug na URL (velocidade — o "Pagamento confirmado!" aparece sem esperar
 * o webhook). Quem chegar primeiro confirma; o segundo encontra pago e
 * não faz nada. A prova é sempre a mesma: payment_check + valor conferido.
 */
export async function confirmarPagamentoInfinitePay(
  pedido: Pedido,
  transactionNsu: string,
  slug: string,
  receiptUrl?: string | null
): Promise<ResultadoConfirmacao> {
  if (pedido.status_pagamento === 'pago') return 'ja-estava-pago'

  let conferencia
  try {
    conferencia = await conferirPagamentoInfinitePay({
      orderNsu: pedido.id,
      transactionNsu,
      slug,
    })
  } catch (erro) {
    console.error('[infinitepay] falha ao conferir o pagamento', erro)
    return 'falha-consulta'
  }

  if (!conferencia.pago) return 'nao-pago'
  if (conferencia.valorCentavos < pedido.total_centavos) {
    console.error(
      `[infinitepay] valor divergente no pedido ${pedido.id}: pago ${conferencia.valorCentavos}, devido ${pedido.total_centavos}`
    )
    return 'divergente'
  }

  const supabase = criarClienteAdmin()
  await supabase
    .from('pedidos')
    .update({
      status_pagamento: 'pago',
      metodo_pagamento: conferencia.metodo,
      ip_slug: slug,
      ip_transaction_nsu: transactionNsu,
      ip_receipt_url: receiptUrl ?? null,
      status: pedido.status === 'aguardando_pagamento' ? 'recebido' : pedido.status,
    })
    .eq('id', pedido.id)

  await supabase.from('pedido_eventos').insert({
    pedido_id: pedido.id,
    de: pedido.status,
    para: 'recebido',
    origem: 'webhook',
  })

  await consumirCupom(pedido.cupom_codigo)

  // aviso é bônus: falha no WhatsApp não desfaz um pagamento confirmado
  try {
    const [config, base] = await Promise.all([buscarConfiguracoes(), urlBase()])
    await avisarPedidoConfirmado(pedido, config.nome, `${base}/pedido/${pedido.id}`)
  } catch (erro) {
    console.warn('[infinitepay] não consegui avisar o cliente', erro)
  }

  return 'pago'
}
