import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { confirmarPagamentoInfinitePay } from '@/lib/confirmar-infinitepay'
import { infinitePayConfigurado } from '@/lib/infinitepay'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Pedido } from '@/lib/types'

/**
 * Webhook da InfinitePay.
 *
 * A InfinitePay não assina o aviso — qualquer um consegue chamar esta URL.
 * Por isso o corpo NUNCA é fonte de verdade: a confirmação de verdade mora
 * em confirmarPagamentoInfinitePay(), que pergunta ao payment_check e
 * compara o valor. Este webhook é a garantia; a volta do cliente ao site
 * confirma mais rápido e este aviso encontra o pedido já pago.
 *
 * Contrato deles: resposta 200 encerra; diferente de 200 é reenviado.
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

  const resultado = await confirmarPagamentoInfinitePay(
    pedido as Pedido,
    aviso.transaction_nsu,
    slug,
    aviso.receipt_url ?? null
  )

  switch (resultado) {
    case 'pago':
      return Response.json({ ok: true }, { status: 200 })
    case 'ja-estava-pago':
      return Response.json({ ok: true, nota: 'já estava pago' }, { status: 200 })
    case 'nao-pago':
      return Response.json({ ok: true, nota: 'ainda não consta como pago' }, { status: 200 })
    case 'divergente':
      return Response.json({ erro: 'valor divergente' }, { status: 200 })
    case 'falha-consulta':
      return Response.json({ erro: 'falha ao conferir' }, { status: 400 }) // deixa reenviar
  }
}

/** Dá para conferir a URL no navegador sem disparar nada. */
export async function GET() {
  return Response.json({ ok: true, servico: 'webhook infinitepay' })
}
