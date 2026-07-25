import { MercadoPagoConfig, Payment, Preference } from 'mercadopago'
import { headers } from 'next/headers'

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

function cliente() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN não configurado.')
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10000 },
  })
}

/** URL pública do app. Vem do env; em dev cai para o host da requisição. */
export async function urlBase() {
  const doEnv = process.env.NEXT_PUBLIC_URL_BASE?.replace(/\/$/, '')
  if (doEnv) return doEnv

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}

export type PreferenciaCriada = { preferenceId: string; urlPagamento: string }

/**
 * Cria a preferência do Checkout Pro (Pix, cartão e saldo em uma tela só).
 *
 * Vai uma linha única com o total do pedido em vez do carrinho item a item:
 * o desconto de cupom não teria como ser representado item a item sem
 * introduzir centavos de diferença entre o que cobramos e o que registramos.
 */
export async function criarPreferencia(pedido: {
  id: string
  numero: number
  totalCentavos: number
  clienteNome: string
  clienteTelefone: string
  descricaoItens: string
  nomeLoja: string
}): Promise<PreferenciaCriada> {
  const base = await urlBase()
  const seguro = base.startsWith('https://')

  const resposta = await new Preference(cliente()).create({
    body: {
      items: [
        {
          id: pedido.id,
          title: `Pedido #${pedido.numero} · ${pedido.nomeLoja}`,
          description: pedido.descricaoItens.slice(0, 250),
          category_id: 'food',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number((pedido.totalCentavos / 100).toFixed(2)),
        },
      ],
      payer: { name: pedido.clienteNome },
      external_reference: pedido.id,
      notification_url: `${base}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${base}/pedido/${pedido.id}`,
        pending: `${base}/pedido/${pedido.id}`,
        failure: `${base}/pedido/${pedido.id}`,
      },
      // o Mercado Pago exige https para voltar sozinho; em dev o cliente clica em "voltar"
      ...(seguro ? { auto_return: 'approved' as const } : {}),
      statement_descriptor: pedido.nomeLoja.slice(0, 22),
      payment_methods: {
        // boleto não serve para retirada no mesmo dia
        excluded_payment_types: [{ id: 'ticket' }],
        installments: 1,
      },
      expires: true,
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  })

  const urlPagamento = resposta.init_point ?? resposta.sandbox_init_point
  if (!resposta.id || !urlPagamento) {
    throw new Error('O Mercado Pago não devolveu o link de pagamento.')
  }
  return { preferenceId: String(resposta.id), urlPagamento }
}

export type PagamentoConsultado = {
  id: string
  status: string
  aprovado: boolean
  pedidoId: string | null
  valorCentavos: number
}

/** Consulta o pagamento direto na API — nunca confiamos no corpo do webhook. */
export async function consultarPagamento(paymentId: string): Promise<PagamentoConsultado | null> {
  const pagamento = await new Payment(cliente()).get({ id: paymentId })
  if (!pagamento?.id) return null

  return {
    id: String(pagamento.id),
    status: pagamento.status ?? 'desconhecido',
    aprovado: pagamento.status === 'approved',
    pedidoId: pagamento.external_reference ?? null,
    valorCentavos: Math.round((pagamento.transaction_amount ?? 0) * 100),
  }
}
