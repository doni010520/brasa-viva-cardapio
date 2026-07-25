import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago'
import type { NextRequest } from 'next/server'
import { consumirCupom } from '@/lib/cupons'
import { consultarPagamento } from '@/lib/mercadopago'
import { criarClienteAdmin } from '@/lib/supabase/server'

/**
 * Webhook do Mercado Pago.
 *
 * Regras que valem ouro aqui:
 *  - a assinatura é conferida antes de qualquer coisa;
 *  - o corpo da notificação NÃO é fonte de verdade: consultamos o pagamento na API;
 *  - o valor pago é comparado com o total do pedido (senão alguém paga R$ 0,01);
 *  - respondemos 200 mesmo em caso ignorado, para o MP não ficar reenviando.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  let corpo: Record<string, unknown> = {}
  try {
    corpo = await request.json()
  } catch {
    // algumas notificações chegam só com query string
  }

  const dados = (corpo.data ?? {}) as { id?: string | number }
  const paymentId = String(dados.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')
  const tipo = String(corpo.type ?? url.searchParams.get('type') ?? '')

  if (tipo && tipo !== 'payment') {
    return Response.json({ ignorado: `tipo ${tipo}` }, { status: 200 })
  }
  if (!paymentId) {
    return Response.json({ erro: 'sem id de pagamento' }, { status: 400 })
  }

  const segredo = process.env.MP_WEBHOOK_SECRET
  if (segredo) {
    try {
      WebhookSignatureValidator.validate({
        xSignature: request.headers.get('x-signature'),
        xRequestId: request.headers.get('x-request-id'),
        dataId: paymentId,
        secret: segredo,
        toleranceSeconds: 300,
      })
    } catch (erro) {
      const motivo = erro instanceof InvalidWebhookSignatureError ? erro.reason : 'desconhecido'
      console.warn('[webhook mp] assinatura recusada:', motivo)
      return Response.json({ erro: 'assinatura inválida' }, { status: 401 })
    }
  } else {
    console.warn('[webhook mp] MP_WEBHOOK_SECRET não configurado — assinatura não conferida.')
  }

  let pagamento
  try {
    pagamento = await consultarPagamento(paymentId)
  } catch (erro) {
    console.error('[webhook mp] falha ao consultar o pagamento', erro)
    return Response.json({ erro: 'falha ao consultar' }, { status: 500 }) // deixa o MP reenviar
  }

  if (!pagamento?.pedidoId) {
    return Response.json({ ignorado: 'pagamento sem pedido vinculado' }, { status: 200 })
  }

  const supabase = criarClienteAdmin()
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, status, status_pagamento, total_centavos, cupom_codigo')
    .eq('id', pagamento.pedidoId)
    .maybeSingle()

  if (!pedido) {
    return Response.json({ ignorado: 'pedido não encontrado' }, { status: 200 })
  }
  if (pedido.status_pagamento === 'pago') {
    return Response.json({ ok: true, nota: 'já estava pago' }, { status: 200 })
  }

  if (!pagamento.aprovado) {
    const falhou = ['rejected', 'cancelled'].includes(pagamento.status)
    if (falhou) {
      await supabase
        .from('pedidos')
        .update({ status_pagamento: 'falhou', mp_payment_id: pagamento.id })
        .eq('id', pedido.id)
    }
    return Response.json({ ok: true, status: pagamento.status }, { status: 200 })
  }

  if (pagamento.valorCentavos < pedido.total_centavos) {
    console.error(
      `[webhook mp] valor divergente no pedido ${pedido.id}: pago ${pagamento.valorCentavos}, devido ${pedido.total_centavos}`
    )
    return Response.json({ erro: 'valor divergente' }, { status: 200 })
  }

  await supabase
    .from('pedidos')
    .update({
      status_pagamento: 'pago',
      mp_payment_id: pagamento.id,
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

  return Response.json({ ok: true }, { status: 200 })
}

/** O Mercado Pago faz um GET de teste ao salvar a URL no painel. */
export async function GET() {
  return Response.json({ ok: true, servico: 'webhook mercado pago' })
}
