import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { buscarConfiguracoes } from '@/lib/dados'
import { comandaEscpos } from '@/lib/escpos'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Pedido } from '@/lib/types'

/**
 * Fila de impressão, consumida pelo agente que roda num PC do restaurante.
 *
 * GET  -> devolve as comandas pendentes, já em ESC/POS (base64)
 * POST -> o agente avisa o que imprimiu e o que falhou
 *
 * A comanda é montada AQUI, não no agente: assim mudar o layout do cupom
 * é mexer no servidor, sem ninguém ter que atualizar o programa da loja.
 */

const MAX_TENTATIVAS = 5

function autorizado(request: NextRequest) {
  const esperado = process.env.TOKEN_IMPRESSAO
  if (!esperado) return false

  const cabecalho = request.headers.get('authorization') ?? ''
  const token = cabecalho.replace(/^Bearer\s+/i, '').trim()

  // comparação de tamanho fixo evita vazar o token por tempo de resposta
  if (token.length !== esperado.length) return false
  let diferenca = 0
  for (let i = 0; i < token.length; i++) {
    diferenca |= token.charCodeAt(i) ^ esperado.charCodeAt(i)
  }
  return diferenca === 0
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const supabase = criarClienteAdmin()

  const { data: pendentes, error } = await supabase
    .from('impressoes')
    .select('id, pedido_id, via, tentativas')
    .eq('status', 'pendente')
    .lt('tentativas', MAX_TENTATIVAS)
    .order('criado_em', { ascending: true })
    .limit(10)

  if (error) {
    return Response.json({ erro: 'falha ao ler a fila' }, { status: 500 })
  }
  if (!pendentes?.length) {
    return Response.json({ comandas: [] })
  }

  const config = await buscarConfiguracoes()

  const comandas = []
  for (const trabalho of pendentes) {
    const { data } = await supabase
      .from('pedidos')
      .select('*, itens:pedido_itens(*)')
      .eq('id', trabalho.pedido_id)
      .maybeSingle()

    if (!data) {
      // pedido sumiu: não adianta insistir
      await supabase
        .from('impressoes')
        .update({ status: 'erro', erro: 'pedido não encontrado' })
        .eq('id', trabalho.id)
      continue
    }

    const pedido = data as Pedido
    const bytes = comandaEscpos(pedido, config.nome)

    comandas.push({
      id: trabalho.id,
      pedido: String(pedido.numero).padStart(3, '0'),
      via: trabalho.via,
      // ESC/POS pronto: o agente só despeja na impressora
      escpos: Buffer.from(bytes).toString('base64'),
    })

    await supabase
      .from('impressoes')
      .update({ tentativas: trabalho.tentativas + 1 })
      .eq('id', trabalho.id)
  }

  return Response.json({ comandas })
}

const esquemaConfirmacao = z.object({
  resultados: z
    .array(
      z.object({
        id: z.string().uuid(),
        ok: z.boolean(),
        erro: z.string().max(300).optional(),
      })
    )
    .min(1)
    .max(20),
})

export async function POST(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const analise = esquemaConfirmacao.safeParse(await request.json().catch(() => null))
  if (!analise.success) {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }

  const supabase = criarClienteAdmin()

  for (const resultado of analise.data.resultados) {
    await supabase
      .from('impressoes')
      .update(
        resultado.ok
          ? { status: 'impresso', impresso_em: new Date().toISOString(), erro: null }
          : { erro: resultado.erro ?? 'falha na impressora' }
      )
      .eq('id', resultado.id)
  }

  return Response.json({ ok: true })
}
