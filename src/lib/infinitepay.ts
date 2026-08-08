import { apenasDigitos } from './format'
import { urlBase } from './url'

/**
 * Checkout da InfinitePay.
 *
 * Diferente do Checkout Transparente do Mercado Pago, aqui o cliente SAI do
 * site: criamos um link de pagamento, ele paga na página da InfinitePay
 * (Pix taxa zero ou cartão em até 12x) e volta pelo redirect. Em troca da
 * saída, o Pix não paga taxa — para restaurante, é a conta que fecha.
 *
 * As regras da casa continuam as mesmas de sempre:
 *  - o VALOR do link sai do pedido gravado no banco, nunca do navegador;
 *  - o webhook deles NÃO é fonte de verdade: confirmamos no payment_check
 *    e comparamos o valor pago com o total antes de liberar a cozinha.
 *
 * A conta é identificada só pela InfiniteTag (o "$handle" do app) — não
 * existe chave secreta. Por isso a conferência ativa no payment_check é
 * obrigatória: qualquer um consegue chamar nosso webhook, mas só a
 * InfinitePay sabe dizer se a fatura foi paga de verdade.
 */

const API = 'https://api.checkout.infinitepay.io'

export function infinitePayConfigurado() {
  return Boolean(tagDaConta())
}

/** A InfiniteTag da env, aceitando com ou sem o $ na frente. */
function tagDaConta() {
  return (process.env.INFINITEPAY_HANDLE ?? '').trim().replace(/^\$/, '')
}

type PedidoParaLink = {
  id: string
  numero: number
  total_centavos: number
  cliente_nome: string
  cliente_email: string | null
  cliente_telefone: string
  tipo_entrega: 'local' | 'retirada' | 'entrega'
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
}

/**
 * Endereço que vai no link SÓ para o checkout deles não abrir a etapa
 * "Entrega" — quem cuida de entrega é o nosso site. Pedido de entrega leva
 * o endereço do cliente; retirada e mesa levam o da própria churrascaria.
 * O CEP é sempre o da loja: o site não pede CEP do cliente (bairro fechado
 * resolve a taxa), e o campo ali é decorativo.
 */
function enderecoParaLink(pedido: PedidoParaLink) {
  if (pedido.tipo_entrega === 'entrega' && pedido.endereco_rua) {
    return {
      cep: '42850000',
      street: pedido.endereco_rua,
      number: pedido.endereco_numero ?? 's/n',
      neighborhood: pedido.endereco_bairro ?? 'Centro',
      ...(pedido.endereco_complemento ? { complement: pedido.endereco_complemento } : {}),
    }
  }
  return {
    cep: '42850000',
    street: 'Rua Padre Camilo Torrent',
    number: '557',
    neighborhood: 'Cristo Rei',
  }
}

/** Cria o link de pagamento e devolve a URL para onde mandar o cliente. */
export async function criarLinkInfinitePay(
  pedido: PedidoParaLink,
  nomeLoja: string
): Promise<{ url: string; slug: string | null }> {
  const base = await urlBase()

  const telefone = apenasDigitos(pedido.cliente_telefone)
  const resposta = await fetch(`${API}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle: tagDaConta(),
      // o id do pedido amarra o webhook de volta ao pedido certo
      order_nsu: pedido.id,
      // um item só, com o total fechado: itemizar aqui abriria diferença de
      // centavos com cupom/taxa, e quem detalha o pedido é o nosso site
      items: [
        {
          quantity: 1,
          price: pedido.total_centavos,
          description: `Pedido #${String(pedido.numero).padStart(3, '0')} — ${nomeLoja}`,
        },
      ],
      redirect_url: `${base}/pedido/${pedido.id}`,
      webhook_url: `${base}/api/webhooks/infinitepay`,
      customer: {
        name: pedido.cliente_nome,
        ...(pedido.cliente_email ? { email: pedido.cliente_email } : {}),
        ...(telefone.length >= 10
          ? { phone_number: `+55${telefone.replace(/^55/, '')}` }
          : {}),
      },
      address: enderecoParaLink(pedido),
    }),
    signal: AbortSignal.timeout(15000),
  })

  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new Error(`InfinitePay /links respondeu ${resposta.status}: ${texto.slice(0, 300)}`)
  }

  let corpo: Record<string, unknown>
  try {
    corpo = JSON.parse(texto)
  } catch {
    throw new Error(`InfinitePay /links devolveu algo que não é JSON: ${texto.slice(0, 300)}`)
  }

  // O nome do campo da URL não está na documentação pública; aceitamos os
  // prováveis e, se nenhum vier, o erro guarda o corpo cru para ajustarmos.
  const dados = (corpo.data ?? {}) as Record<string, unknown>
  const url = [corpo.url, corpo.link, corpo.checkout_url, dados.url, dados.link].find(
    (v): v is string => typeof v === 'string' && v.startsWith('http')
  )
  if (!url) {
    throw new Error(`InfinitePay /links sem URL de checkout no corpo: ${texto.slice(0, 300)}`)
  }

  const slug = [corpo.slug, corpo.invoice_slug, dados.slug].find(
    (v): v is string => typeof v === 'string' && v.length > 0
  )

  return { url, slug: slug ?? null }
}

/**
 * Pergunta à InfinitePay se a fatura foi paga de verdade.
 * É a ÚNICA prova aceita — o corpo do webhook sozinho não vale nada.
 */
export async function conferirPagamentoInfinitePay(dados: {
  orderNsu: string
  transactionNsu: string
  slug: string
}): Promise<{ pago: boolean; valorCentavos: number; metodo: string | null }> {
  const resposta = await fetch(`${API}/payment_check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle: tagDaConta(),
      order_nsu: dados.orderNsu,
      transaction_nsu: dados.transactionNsu,
      slug: dados.slug,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!resposta.ok) {
    throw new Error(`InfinitePay payment_check respondeu ${resposta.status}`)
  }

  const corpo = (await resposta.json()) as Record<string, unknown>
  return {
    pago: corpo.success === true && corpo.paid === true,
    valorCentavos: Number(corpo.paid_amount ?? corpo.amount ?? 0),
    metodo: typeof corpo.capture_method === 'string' ? corpo.capture_method : null,
  }
}
