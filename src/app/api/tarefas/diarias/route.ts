import type { NextRequest } from 'next/server'
import { enviarParabensDeHoje } from '@/lib/aniversarios'

/**
 * Tarefas do dia, chamadas por um agendador de fora (cron do EasyPanel,
 * cron-job.org, o que for). Hoje só manda os parabéns de aniversário.
 *
 * Chame uma vez por dia, de manhã. Rodar de novo no mesmo dia não faz mal:
 * cada pessoa só recebe um parabéns por ano, e a marca fica gravada.
 */

export const dynamic = 'force-dynamic'

function autorizado(request: NextRequest) {
  // Reaproveita o token do webhook: é a mesma classe de segredo e evita mais
  // uma variável para o dono errar na hora de configurar.
  const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN
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

async function rodar(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }

  try {
    const aniversarios = await enviarParabensDeHoje()
    console.log('[tarefas] aniversários', aniversarios)
    return Response.json({ ok: true, aniversarios })
  } catch (erro) {
    console.error('[tarefas] falhou', erro)
    return Response.json({ erro: 'falha ao rodar as tarefas' }, { status: 500 })
  }
}

// GET e POST porque cada agendador manda de um jeito.
export const GET = rodar
export const POST = rodar
