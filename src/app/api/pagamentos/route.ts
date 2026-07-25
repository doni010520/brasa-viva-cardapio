import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { buscarConfiguracoes } from '@/lib/dados'
import { consumirCupom } from '@/lib/cupons'
import { criarPagamento, explicarRecusa, mercadoPagoConfigurado } from '@/lib/mercadopago'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { avisarPedidoConfirmado } from '@/lib/whatsapp'
import { urlBase } from '@/lib/mercadopago'
import type { Pedido } from '@/lib/types'

/**
 * Recebe o que o Payment Brick coletou no navegador e cria o pagamento.
 *
 * O que NÃO aceitamos do cliente: o valor. Ele sai do pedido no banco.
 * O que aceitamos: o token do cartão (gerado no navegador), o meio escolhido
 * e os dados do pagador (CPF, e-mail, endereço do boleto).
 */

const esquema = z.object({
  pedidoId: z.string().uuid(),
  dados: z.object({
    payment_method_id: z.string().max(40).optional(),
    payment_type_id: z.string().max(40).optional(),
    token: z.string().max(200).optional(),
    installments: z.number().int().min(1).max(24).optional(),
    issuer_id: z.union([z.string(), z.number()]).optional(),
    payer: z
      .object({
        email: z.string().max(120).optional(),
        identification: z
          .object({ type: z.string().max(10).optional(), number: z.string().max(30).optional() })
          .optional(),
        first_name: z.string().max(60).optional(),
        last_name: z.string().max(60).optional(),
        address: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
})

export async function POST(request: NextRequest) {
  if (!mercadoPagoConfigurado()) {
    return Response.json({ ok: false, erro: 'Pagamento online não configurado.' }, { status: 503 })
  }

  const analise = esquema.safeParse(await request.json().catch(() => null))
  if (!analise.success) {
    return Response.json({ ok: false, erro: 'Dados de pagamento inválidos.' }, { status: 400 })
  }
  const { pedidoId, dados } = analise.data

  const supabase = criarClienteAdmin()
  const { data } = await supabase.from('pedidos').select('*').eq('id', pedidoId).maybeSingle()
  if (!data) {
    return Response.json({ ok: false, erro: 'Pedido não encontrado.' }, { status: 404 })
  }
  const pedido = data as Pedido

  if (pedido.status_pagamento === 'pago') {
    return Response.json({ ok: true, status: 'approved', jaEstavaPago: true })
  }
  if (pedido.status === 'cancelado') {
    return Response.json({ ok: false, erro: 'Este pedido foi cancelado.' }, { status: 409 })
  }

  const config = await buscarConfiguracoes()

  // o meio escolhido precisa estar ligado pelo dono
  const metodo = dados.payment_method_id ?? 'pix'
  const tipo = dados.payment_type_id ?? ''
  const permitido =
    (metodo === 'pix' && config.aceita_pix) ||
    (tipo === 'credit_card' && config.aceita_cartao) ||
    (tipo === 'debit_card' && config.aceita_cartao)

  if (!permitido) {
    return Response.json(
      { ok: false, erro: 'Esta forma de pagamento não está disponível agora.' },
      { status: 400 }
    )
  }

  let resultado
  try {
    resultado = await criarPagamento(
      {
        id: pedido.id,
        numero: pedido.numero,
        total_centavos: pedido.total_centavos,
        cliente_nome: pedido.cliente_nome,
        cliente_email: pedido.cliente_email,
        cliente_cpf: pedido.cliente_cpf,
      },
      { ...dados, issuer_id: dados.issuer_id ? String(dados.issuer_id) : undefined },
      config.pix_expira_min
    )
  } catch (erro) {
    console.error('[pagamentos] falha ao criar pagamento', erro)
    return Response.json(
      { ok: false, erro: 'Não consegui falar com o Mercado Pago. Tente de novo.' },
      { status: 502 }
    )
  }

  // guarda o que o cliente precisa ver (QR do Pix, link do boleto) e o desfecho
  await supabase
    .from('pedidos')
    .update({
      mp_payment_id: resultado.id,
      metodo_pagamento: resultado.metodo,
      pix_copia_cola: resultado.pixCopiaCola,
      pix_expira_em: resultado.pixExpiraEm,
      pagamento_detalhe: resultado.detalhe,
      status_pagamento: resultado.aprovado ? 'pago' : resultado.pendente ? 'pendente' : 'falhou',
      status: resultado.aprovado && pedido.status === 'aguardando_pagamento'
        ? 'recebido'
        : pedido.status,
    })
    .eq('id', pedido.id)

  if (resultado.aprovado) {
    await supabase.from('pedido_eventos').insert({
      pedido_id: pedido.id,
      de: pedido.status,
      para: 'recebido',
      origem: 'sistema',
    })
    await consumirCupom(pedido.cupom_codigo)

    try {
      const base = await urlBase()
      await avisarPedidoConfirmado(pedido, config.nome, `${base}/pedido/${pedido.id}`)
    } catch (erro) {
      console.warn('[pagamentos] não consegui avisar no WhatsApp', erro)
    }
  }

  return Response.json({
    ok: true,
    status: resultado.status,
    aprovado: resultado.aprovado,
    pendente: resultado.pendente,
    metodo: resultado.metodo,
    // mensagem amigável só quando recusado
    erro: resultado.aprovado || resultado.pendente ? undefined : explicarRecusa(resultado.detalhe),
  })
}
