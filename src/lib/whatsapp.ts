import { apenasDigitos, moeda } from './format'
import { horaCurta } from './tempo'
import type { Pedido, StatusPedido } from './types'

/**
 * Avisos automáticos no WhatsApp via uazapi.
 *
 * Regra de ouro: isto NUNCA pode derrubar um pedido. Toda falha é registrada
 * no log e engolida — o cliente prefere um pedido sem aviso a um pedido perdido.
 */

export function whatsappConfigurado() {
  return Boolean(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN)
}

/**
 * Normaliza para o formato que a API espera: 55 + DDD + número.
 *
 * Atenção ao 9º dígito: celulares brasileiros têm 9 na frente, mas contas
 * antigas de WhatsApp podem estar registradas sem ele. A uazapi resolve isso
 * do lado dela; se algum número não receber, é o primeiro lugar a investigar.
 */
export function numeroParaEnvio(telefone: string) {
  const digitos = apenasDigitos(telefone)
  if (!digitos) return null
  const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`
  // 55 + 2 (DDD) + 8 ou 9 dígitos
  return comDdi.length >= 12 && comDdi.length <= 13 ? comDdi : null
}

/**
 * Manda uma mensagem de texto. Exportada porque o agente de IA também fala
 * por aqui — e o silencioso "return false" quando não há uazapi configurada
 * é o que segura o sistema de pé em ambiente de teste.
 */
export async function enviarTexto(telefone: string, texto: string) {
  if (!whatsappConfigurado()) return false

  const numero = numeroParaEnvio(telefone)
  if (!numero) {
    console.warn('[whatsapp] telefone fora do padrão, aviso não enviado:', telefone)
    return false
  }

  const base = process.env.UAZAPI_URL!.replace(/\/$/, '')

  try {
    const resposta = await fetch(`${base}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: process.env.UAZAPI_TOKEN!,
      },
      body: JSON.stringify({ number: numero, text: texto }),
      signal: AbortSignal.timeout(8000),
    })

    if (!resposta.ok) {
      console.warn('[whatsapp] envio recusado:', resposta.status, await resposta.text())
      return false
    }
    return true
  } catch (erro) {
    console.warn('[whatsapp] falha no envio:', erro)
    return false
  }
}

function codigo(pedido: Pick<Pedido, 'numero'>) {
  return String(pedido.numero).padStart(3, '0')
}

type DadosAviso = Pick<
  Pedido,
  | 'numero'
  | 'cliente_nome'
  | 'cliente_telefone'
  | 'total_centavos'
  | 'tipo_entrega'
  | 'retirada_prevista'
  | 'forma_pagamento'
>

/** Confirmação assim que o pedido entra na fila da cozinha. */
export async function avisarPedidoConfirmado(
  pedido: DadosAviso,
  nomeLoja: string,
  urlAcompanhamento: string
) {
  const entrega = pedido.tipo_entrega === 'entrega'
  const hora = horaCurta(pedido.retirada_prevista)

  const linhas = [
    `*${nomeLoja}*`,
    ``,
    `Oi, ${pedido.cliente_nome}! Recebemos seu pedido *#${codigo(pedido)}*. ✅`,
    ``,
    `Total: *${moeda(pedido.total_centavos)}*`,
    entrega
      ? `Entrega${hora ? ` prevista para as ${hora}` : ''}.`
      : `Retirada no balcão${hora ? ` a partir das ${hora}` : ''}.`,
    // entrega é sempre paga pelo site; "local" só acontece na retirada
    pedido.forma_pagamento === 'local'
      ? `Pagamento no balcão, na hora de retirar.`
      : `Pagamento confirmado. 👍`,
    ``,
    `Acompanhe por aqui:`,
    urlAcompanhamento,
    ``,
    // A conversa do WhatsApp vira o arquivo do cliente: cada pedido deixa aqui
    // o seu link, e é onde ele procura quando troca de celular.
    `Guarde esta mensagem: é por ela que você acha seu pedido depois.`,
  ]

  return enviarTexto(pedido.cliente_telefone, linhas.filter((l) => l !== null).join('\n'))
}

/** Avisos de mudança de status. Só manda nos momentos que interessam ao cliente. */
export async function avisarMudancaDeStatus(
  pedido: DadosAviso,
  novoStatus: StatusPedido,
  nomeLoja: string
) {
  const entrega = pedido.tipo_entrega === 'entrega'

  const mensagens: Partial<Record<StatusPedido, string>> = {
    em_preparo: `*${nomeLoja}*\n\nSeu pedido *#${codigo(pedido)}* entrou no fogo. 🔥\nJá te aviso quando estiver pronto.`,
    pronto: entrega
      ? `*${nomeLoja}*\n\nSeu pedido *#${codigo(pedido)}* está pronto e já vai sair para entrega. 🛵`
      : `*${nomeLoja}*\n\nSeu pedido *#${codigo(pedido)}* está *pronto para retirada*! 🎉\n\nÉ só chegar no balcão e falar o número *${codigo(pedido)}*.`,
    saiu_para_entrega: `*${nomeLoja}*\n\nSeu pedido *#${codigo(pedido)}* saiu para entrega. 🛵\nJá já chega aí!`,
    cancelado: `*${nomeLoja}*\n\nSeu pedido *#${codigo(pedido)}* foi cancelado.\nSe não era isso que você esperava, fala com a gente por aqui mesmo.`,
  }

  const texto = mensagens[novoStatus]
  if (!texto) return false

  return enviarTexto(pedido.cliente_telefone, texto)
}

