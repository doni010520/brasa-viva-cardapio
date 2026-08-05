import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { consumirCupom } from '@/lib/cupons'
import { buscarConfiguracoes } from '@/lib/dados'
import { conferirPagamentoInfinitePay, infinitePayConfigurado } from '@/lib/infinitepay'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { urlBase } from '@/lib/url'
import { avisarPedidoConfirmado } from '@/lib/whatsapp'

/**
 * Webhook da InfinitePay.
 *
 * A InfinitePay não assina o aviso — qualquer um consegue chamar esta URL.
 * Por isso as regras de ouro daqui são ainda menos negociáveis que no
 * Mercado Pago:
 *  - o corpo do aviso NÃO é fonte de verdade: conferimos no payment_check;
 *  - o valor confirmado é comparado com o total do pedido;
 *  - respondemos 200 no caso ignorado e 400 quando queremos reenvio
 *    (é o contrato deles: "respondeu diferente de 200, tentamos de novo").
 */

const esquemaAviso = z.object({
  order_nsu: z.string().uuid(),
  transaction_nsu: z.string().min(1).max(120),
  invoice_slug: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  receipt_url: z.string().url().max(500).optional(),
})

export async function POST(request: NextRequest) {
  if (!infinitePayConfigurado()) {
    // sem a InfiniteTag não há como conferir nada; 400 deixa reenviar
    return Response.json({ erro: 'INFINITEPAY_HANDLE não configurado' }, { status: 400 })
  }

  const analise = esquemaAviso.safeParse(await request.json().catch(() => null))
  if (!analise.success) {
    return Response.json({ erro: 'aviso incompleto' }, { status: 400 })
  }
  const aviso = analise.data
  const slug = aviso.invoice_slug ?? aviso.slug
  if (!slug) return Response.json({ erro: 'aviso sem slug' }, { status: 400 })

  const supabase = criarClienteAdmin()
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', aviso.order_nsu)
    .maybeSingle()

  if (!pedido) {
    return Response.json({ ignorado: 'pedido não encontrado' }, { status: 200 })
  }
  if (pedido.status_pagamento === 'pago') {
    return Response.json({ ok: true, nota: 'já estava pago' }, { status: 200 })
  }

  // fonte de verdade: perguntar à InfinitePay, nunca acreditar no aviso
  let conferencia
  try {
    conferencia = await conferirPagamentoInfinitePay({
      orderNsu: aviso.order_nsu,
      transactionNsu: aviso.transaction_nsu,
      slug,
    })
  } catch (erro) {
    console.error('[webhook infinitepay] falha ao conferir o pagamento', erro)
    return Response.json({ erro: 'falha ao conferir' }, { status: 400 }) // deixa reenviar
  }

  if (!conferencia.pago) {
    return Response.json({ ok: true, nota: 'ainda não consta como pago' }, { status: 200 })
  }
  if (conferencia.valorCentavos < pedido.total_centavos) {
    console.error(
      `[webhook infinitepay] valor divergente no pedido ${pedido.id}: pago ${conferencia.valorCentavos}, devido ${pedido.total_centavos}`
    )
    return Response.json({ erro: 'valor divergente' }, { status: 200 })
  }

  await supabase
    .from('pedidos')
    .update({
      status_pagamento: 'pago',
      metodo_pagamento: conferencia.metodo,
      ip_slug: slug,
      ip_transaction_nsu: aviso.transaction_nsu,
      ip_receipt_url: aviso.receipt_url ?? null,
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
    console.warn('[webhook infinitepay] não consegui avisar o cliente', erro)
  }

  return Response.json({ ok: true }, { status: 200 })
}

/** Dá para conferir a URL no navegador sem disparar nada. */
export async function GET() {
  return Response.json({ ok: true, servico: 'webhook infinitepay' })
}
