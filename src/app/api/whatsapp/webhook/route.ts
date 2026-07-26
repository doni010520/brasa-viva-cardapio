import type { NextRequest } from 'next/server'
import { atender, normalizarTelefone } from '@/lib/agente'
import { temIA } from '@/lib/agente/modelo'
import { buscarConfiguracoes } from '@/lib/dados'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { enviarTexto } from '@/lib/whatsapp'

/**
 * Entrada das mensagens que chegam no WhatsApp da loja (webhook da uazapi).
 *
 * Este endereço é público na internet, então ele desconfia de tudo: exige o
 * token combinado, ignora o que a própria loja enviou, ignora grupo, e
 * descarta mensagem repetida — webhook repete, e repetir aqui viraria pedido
 * em dobro na cozinha.
 */

export const dynamic = 'force-dynamic'

function autorizado(request: NextRequest) {
  const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN
  // Sem token configurado o webhook fica fechado. Endpoint que fecha pedido
  // não pode ficar aberto "só até configurarem".
  if (!esperado) return false

  const recebido = (
    request.headers.get('x-webhook-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(request.url).searchParams.get('token') ??
    ''
  ).trim()

  if (recebido.length !== esperado.length) return false
  let diferenca = 0
  for (let i = 0; i < recebido.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferenca === 0
}

/**
 * A uazapi manda formatos um pouco diferentes conforme a versão e o evento.
 * Em vez de casar com um só, procura os campos onde eles costumam estar.
 */
function extrair(corpo: Record<string, unknown>) {
  const m = (corpo.message ?? corpo.data ?? corpo) as Record<string, unknown>

  const daLoja = Boolean(m.fromMe ?? m.fromme ?? m.from_me)
  const chat = String(m.chatid ?? m.chatId ?? m.from ?? m.sender ?? corpo.chatid ?? '')
  const texto = String(
    m.text ?? m.body ?? m.content ?? m.conversation ?? m.caption ?? ''
  ).trim()
  const id = String(m.id ?? m.messageid ?? m.messageId ?? m.key ?? '')
  const tipo = String(m.messageType ?? m.type ?? 'text')
  const nome = m.senderName ?? m.pushName ?? m.notifyName ?? null

  return {
    daLoja,
    // grupo termina em @g.us; atendimento é conversa de um para um
    ehGrupo: chat.includes('@g.us'),
    telefone: chat.split('@')[0],
    texto,
    id,
    tipo,
    nome: nome ? String(nome).slice(0, 80) : null,
  }
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }

  let corpo: Record<string, unknown>
  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  const evento = extrair(corpo)

  // Responder a si mesmo é como o robô entra em laço com ele próprio.
  if (evento.daLoja) return Response.json({ ignorado: 'mensagem da própria loja' })
  if (evento.ehGrupo) return Response.json({ ignorado: 'grupo' })

  const telefone = normalizarTelefone(evento.telefone)
  if (!telefone) return Response.json({ ignorado: 'telefone fora do padrão' })

  const config = await buscarConfiguracoes()
  if (!config.agente_whatsapp_ativo) {
    return Response.json({ ignorado: 'agente desligado no painel' })
  }
  if (!evento.texto) {
    // Áudio, foto e figurinha ainda não são lidos. Melhor dizer isso do que
    // ficar mudo e o cliente achar que ninguém viu.
    await enviarTexto(
      telefone,
      'Ainda não consigo ouvir áudio nem ver imagem por aqui. Pode escrever, por favor?'
    )
    return Response.json({ ignorado: `tipo ${evento.tipo}` })
  }

  // Webhook repete. Sem esta trava, um retry vira segundo pedido.
  const supabase = criarClienteAdmin()
  if (evento.id) {
    const { data } = await supabase
      .from('conversas_whatsapp')
      .select('id')
      .eq('telefone', telefone)
      .eq('ultima_mensagem_id', evento.id)
      .maybeSingle()

    if (data) return Response.json({ ignorado: 'mensagem repetida' })
  }

  try {
    const { respostas } = await atender(telefone, evento.texto)

    if (evento.id) {
      await supabase
        .from('conversas_whatsapp')
        .update({ ultima_mensagem_id: evento.id })
        .eq('telefone', telefone)
    }

    for (const resposta of respostas) {
      await enviarTexto(telefone, resposta)
    }

    return Response.json({ ok: true, respostas: respostas.length })
  } catch (erro) {
    console.error('[agente] falhou ao atender', erro)
    // Cliente no vácuo é o pior desfecho: avisa que houve problema.
    await enviarTexto(
      telefone,
      'Deu um problema aqui no meu lado. Já já alguém da equipe te responde!'
    )
    return Response.json({ erro: 'falha ao atender' }, { status: 500 })
  }
}

/** A uazapi bate com GET para conferir se o endereço existe. */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }
  const config = await buscarConfiguracoes()
  return Response.json({
    ok: true,
    agente_ativo: config.agente_whatsapp_ativo,
    com_ia: temIA(),
  })
}
