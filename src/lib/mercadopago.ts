import { MercadoPagoConfig, Payment } from 'mercadopago'
import { urlBase } from './url'

/**
 * Checkout Transparente do Mercado Pago.
 *
 * O cliente NÃO sai do site: o Payment Brick coleta os dados no navegador
 * (cartão vira token lá mesmo, nunca passa pelo nosso servidor) e este módulo
 * cria o pagamento pela API.
 *
 * Regra que não se negocia: o VALOR sai sempre do nosso banco, nunca do que
 * o navegador mandou.
 */

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

/** A chave pública vai para o navegador; sem ela o Brick não carrega. */
export function chavePublicaMercadoPago() {
  return process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''
}

function cliente() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN não configurado.')
  return new MercadoPagoConfig({ accessToken, options: { timeout: 15000 } })
}

/** URL pública do app. Vem do env; em dev cai para o host da requisição. */
/** Mora em `./url`; reexportado aqui por causa de quem já importava daqui. */
export { urlBase }

// ---------------------------------------------------------------- tipos

/** O que o Payment Brick devolve no onSubmit. Só o necessário. */
export type DadosDoBrick = {
  payment_method_id?: string
  payment_type_id?: string
  token?: string
  installments?: number
  issuer_id?: string
  payer?: {
    email?: string
    identification?: { type?: string; number?: string }
    first_name?: string
    last_name?: string
    address?: {
      zip_code?: string
      street_name?: string
      street_number?: string
      neighborhood?: string
      city?: string
      federal_unit?: string
    }
  }
}

export type PedidoParaPagar = {
  id: string
  numero: number
  total_centavos: number
  cliente_nome: string
  cliente_email: string | null
  cliente_cpf: string | null
}

export type ResultadoPagamento = {
  id: string
  status: string
  detalhe: string
  aprovado: boolean
  pendente: boolean
  metodo: string
  pixCopiaCola: string | null
  pixExpiraEm: string | null
}

function primeiroEUltimoNome(nomeCompleto: string) {
  const partes = nomeCompleto.trim().split(/\s+/)
  return {
    first_name: partes[0] ?? 'Cliente',
    last_name: partes.length > 1 ? partes.slice(1).join(' ') : 'Cliente',
  }
}

const MENSAGENS_DE_RECUSA: Record<string, string> = {
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente.',
  cc_rejected_high_risk: 'O banco recusou por segurança. Tente outro cartão ou pague no Pix.',
  cc_rejected_card_disabled: 'O cartão está desativado. Fale com o banco.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização. Ligue para ele e tente de novo.',
  cc_rejected_duplicated_payment: 'Este pagamento já foi feito.',
  cc_rejected_max_attempts: 'Muitas tentativas. Use outro cartão.',
  cc_rejected_other_reason: 'O banco recusou o pagamento.',
}

export function explicarRecusa(detalhe: string) {
  return MENSAGENS_DE_RECUSA[detalhe] ?? 'O pagamento não foi aprovado. Tente outra forma.'
}

// ------------------------------------------------------------ criação

/**
 * Cria o pagamento no Mercado Pago a partir do pedido (valor vem do banco)
 * e dos dados que o Brick coletou (cartão tokenizado, CPF, endereço do boleto).
 */
export async function criarPagamento(
  pedido: PedidoParaPagar,
  brick: DadosDoBrick,
  pixExpiraMin: number
): Promise<ResultadoPagamento> {
  const base = await urlBase()
  const metodo = brick.payment_method_id ?? 'pix'
  const nomes = primeiroEUltimoNome(pedido.cliente_nome)

  const email =
    brick.payer?.email?.trim() ||
    pedido.cliente_email ||
    // o Mercado Pago exige um e-mail; sem ele o pagamento nem é criado
    `pedido-${pedido.numero}@sem-email.local`

  const cpf = (brick.payer?.identification?.number ?? pedido.cliente_cpf ?? '').replace(/\D/g, '')

  const corpo: Record<string, unknown> = {
    // valor SEMPRE do nosso banco — o navegador não decide preço
    transaction_amount: Number((pedido.total_centavos / 100).toFixed(2)),
    description: `Pedido #${String(pedido.numero).padStart(3, '0')}`,
    external_reference: pedido.id,
    notification_url: `${base}/api/webhooks/mercadopago`,
    payment_method_id: metodo,
    payer: {
      email,
      ...nomes,
      ...(cpf ? { identification: { type: 'CPF', number: cpf } } : {}),
      ...(brick.payer?.address ? { address: brick.payer.address } : {}),
    },
  }

  if (metodo === 'pix') {
    corpo.date_of_expiration = new Date(Date.now() + pixExpiraMin * 60000).toISOString()
  }

  if (brick.token) {
    // cartão: o token veio do navegador, os dados do cartão nunca passam por aqui
    corpo.token = brick.token
    corpo.installments = brick.installments ?? 1
    if (brick.issuer_id) corpo.issuer_id = brick.issuer_id
  }

  const resposta = await new Payment(cliente()).create({
    body: corpo,
    // evita cobrar duas vezes se a rede repetir a requisição
    requestOptions: { idempotencyKey: `pedido-${pedido.id}-${metodo}` },
  })

  const interacao = resposta.point_of_interaction?.transaction_data
  const status = resposta.status ?? 'desconhecido'

  return {
    id: String(resposta.id ?? ''),
    status,
    detalhe: resposta.status_detail ?? '',
    aprovado: status === 'approved',
    pendente: status === 'pending' || status === 'in_process',
    metodo,
    pixCopiaCola: interacao?.qr_code ?? null,
    pixExpiraEm: resposta.date_of_expiration ?? null,
  }
}

// ------------------------------------------------------------ consulta

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
