import webpush from 'web-push'
import { criarClienteAdmin } from './supabase/server'
import { urlBaseConfigurada } from './url'
import type { Pedido, StatusPedido } from './types'

/**
 * Avisos do pedido na tela do celular (Web Push).
 *
 * Mesma regra de ouro do WhatsApp: isto NUNCA pode derrubar um pedido nem
 * segurar uma mudança de status. Toda falha vira log e morre aqui — o cliente
 * prefere um pedido sem aviso a um pedido travado.
 *
 * Diferença que importa em relação ao WhatsApp: aqui não há custo, não há
 * instância para conectar e o aviso aparece com a tela bloqueada. Em troca,
 * vale por APARELHO: quem instalou no celular e no computador tem duas
 * inscrições, e quem trocou de celular deixou uma inscrição morta para trás
 * (o próprio envio limpa essas).
 */

export function pushConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let vapidPronto = false

/**
 * O "subject" é como o serviço de push (Google, Apple, Mozilla) fala com a
 * gente se algo der errado — precisa ser um mailto: ou o endereço do site.
 */
function prepararVapid() {
  if (vapidPronto) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || urlBaseConfigurada() || 'mailto:contato@brasavivadd.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidPronto = true
}

export type DadosInscricao = {
  endpoint: string
  p256dh: string
  auth: string
}

type LinhaInscricao = DadosInscricao & { id: string; falhas: number }

/**
 * Guarda (ou atualiza) o canal daquele aparelho.
 *
 * Upsert pelo endpoint de propósito: o mesmo celular pedindo aviso de um
 * pedido novo tem que ATUALIZAR a linha dele, não criar outra — senão o
 * cliente receberia o mesmo aviso três vezes.
 */
export async function salvarInscricao(dados: {
  inscricao: DadosInscricao
  pedidoId: string | null
  clienteId: string | null
  navegador: string | null
}) {
  const supabase = criarClienteAdmin()

  const { error } = await supabase.from('inscricoes_push').upsert(
    {
      endpoint: dados.inscricao.endpoint,
      p256dh: dados.inscricao.p256dh,
      auth: dados.inscricao.auth,
      pedido_id: dados.pedidoId,
      cliente_id: dados.clienteId,
      navegador: dados.navegador?.slice(0, 200) ?? null,
      falhas: 0,
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    console.warn('[push] não consegui salvar a inscrição', error)
    return false
  }
  return true
}

export async function removerInscricao(endpoint: string) {
  const { error } = await criarClienteAdmin()
    .from('inscricoes_push')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    console.warn('[push] não consegui remover a inscrição', error)
    return false
  }
  return true
}

type Aviso = {
  titulo: string
  corpo: string
  url: string
  /** Avisos com a mesma etiqueta se substituem na bandeja do celular. */
  etiqueta: string
}

/**
 * Manda o aviso e faz a faxina: canal que o servidor de push declara morto
 * (404/410 — app desinstalado, aparelho trocado) sai do banco na hora. Sem
 * isso, a tabela vira um cemitério que só cresce e atrasa cada envio.
 */
async function despachar(inscricoes: LinhaInscricao[], aviso: Aviso) {
  prepararVapid()

  const corpo = JSON.stringify(aviso)
  const supabase = criarClienteAdmin()
  let entregues = 0

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint,
            keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
          },
          corpo,
          {
            // "pronto para retirada" não tem graça chegando amanhã
            TTL: 60 * 60,
            urgency: 'high',
          }
        )
        entregues++
        await supabase
          .from('inscricoes_push')
          .update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 })
          .eq('id', inscricao.id)
      } catch (erro) {
        const status =
          erro instanceof webpush.WebPushError ? erro.statusCode : 0

        if (status === 404 || status === 410) {
          await supabase.from('inscricoes_push').delete().eq('id', inscricao.id)
          return
        }

        console.warn('[push] envio recusado', status || erro)
        await supabase
          .from('inscricoes_push')
          .update({ falhas: inscricao.falhas + 1 })
          .eq('id', inscricao.id)
      }
    })
  )

  return entregues
}

type PedidoDoAviso = Pick<Pedido, 'id' | 'numero' | 'cliente_id' | 'tipo_entrega'>

function codigo(numero: number) {
  return String(numero).padStart(3, '0')
}

/**
 * O texto de cada momento. Curto de propósito: o celular corta a notificação
 * em poucas linhas, e a informação que importa ("pronto", "o número é 012")
 * tem que caber na primeira olhada, sem abrir nada.
 */
function textoDoAviso(pedido: PedidoDoAviso, status: StatusPedido): Omit<Aviso, 'url' | 'etiqueta'> | null {
  const numero = codigo(pedido.numero)
  const entrega = pedido.tipo_entrega === 'entrega'
  const noLocal = pedido.tipo_entrega === 'local'

  switch (status) {
    case 'em_preparo':
      return {
        titulo: `Pedido #${numero} no fogo 🔥`,
        corpo: 'A cozinha começou o seu pedido. Já te aviso quando estiver pronto.',
      }
    case 'pronto':
      if (entrega) {
        return {
          titulo: `Pedido #${numero} pronto 🛵`,
          corpo: 'Já vai sair para entrega.',
        }
      }
      return {
        titulo: `Pedido #${numero} pronto! 🎉`,
        corpo: noLocal
          ? `Pode pegar no balcão — é só falar o número ${numero}.`
          : `É só chegar no balcão e falar o número ${numero}.`,
      }
    case 'saiu_para_entrega':
      return {
        titulo: `Pedido #${numero} saiu para entrega 🛵`,
        corpo: 'Já já chega aí!',
      }
    case 'cancelado':
      return {
        titulo: `Pedido #${numero} cancelado`,
        corpo: 'Se não era isso que você esperava, fale com a gente.',
      }
    // 'recebido', 'aguardando_pagamento' e 'retirado' não viram aviso: o
    // cliente está com a tela na mão nesses momentos.
    default:
      return null
  }
}

/**
 * Avisa todo mundo que pediu para ser avisado sobre este pedido.
 *
 * Manda para duas rodas de gente: quem tocou em "me avise" nesta comanda, e
 * quem já tinha pedido aviso em qualquer pedido anterior sendo o mesmo
 * cliente — assim o segundo almoço já chega avisado, sem pedir de novo.
 */
export async function avisarStatusPorPush(pedido: PedidoDoAviso, novoStatus: StatusPedido) {
  if (!pushConfigurado()) return 0

  const texto = textoDoAviso(pedido, novoStatus)
  if (!texto) return 0

  const supabase = criarClienteAdmin()

  const alvos = [`pedido_id.eq.${pedido.id}`]
  if (pedido.cliente_id) alvos.push(`cliente_id.eq.${pedido.cliente_id}`)

  const { data, error } = await supabase
    .from('inscricoes_push')
    .select('id, endpoint, p256dh, auth, falhas')
    .or(alvos.join(','))

  if (error) {
    console.warn('[push] não consegui listar as inscrições', error)
    return 0
  }
  if (!data?.length) return 0

  const base = urlBaseConfigurada()

  return despachar(data as LinhaInscricao[], {
    ...texto,
    url: `${base}/pedido/${pedido.id}`,
    // um aviso por pedido: o "pronto" substitui o "em preparo" na bandeja
    etiqueta: `pedido-${pedido.id}`,
  })
}
