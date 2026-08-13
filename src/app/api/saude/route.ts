import type { NextRequest } from 'next/server'
import { criarLinkInfinitePay, infinitePayConfigurado } from '@/lib/infinitepay'
import { urlBaseConfigurada } from '@/lib/url'
/**
 * Sinal de vida e diagnóstico do deploy.
 *
 * NÃO toca no banco de propósito: se a checagem dependesse do Supabase, uma
 * instabilidade momentânea do banco faria o orquestrador achar que o app
 * morreu e reiniciar o container em loop — justamente quando o restaurante
 * mais precisa dele de pé.
 *
 * Devolve só SE cada peça está configurada, nunca o valor. Assim dá para
 * conferir um deploy pelo navegador sem expor chave nenhuma.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const urlBase = urlBaseConfigurada()

  // Diagnóstico da InfinitePay DE DENTRO do servidor: tenta criar um link de
  // mentira e devolve o erro cru. Protegido pelo mesmo token da impressão,
  // porque o erro pode citar detalhes internos. Link criado não custa nada.
  const diag = request.nextUrl.searchParams.get('infinitepay')
  if (diag && process.env.TOKEN_IMPRESSAO && diag === process.env.TOKEN_IMPRESSAO) {
    if (!infinitePayConfigurado()) {
      return Response.json({ diagnostico: 'INFINITEPAY_HANDLE não configurado' })
    }
    try {
      const link = await criarLinkInfinitePay(
        {
          id: crypto.randomUUID(),
          numero: 0,
          total_centavos: 100,
          cliente_nome: 'Diagnostico Saude',
          cliente_email: null,
          cliente_telefone: '71999990000',
          tipo_entrega: 'retirada',
          endereco_rua: null,
          endereco_numero: null,
          endereco_complemento: null,
          endereco_bairro: null,
        },
        'Diagnostico'
      )
      return Response.json({ diagnostico: 'ok', url: link.url })
    } catch (erro) {
      return Response.json({
        diagnostico: 'falhou',
        erro: erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro),
        causa:
          erro instanceof Error && erro.cause
            ? String(erro.cause).slice(0, 300)
            : null,
      })
    }
  }

  return Response.json({
    ok: true,
    servico: 'cardapio-brasa-viva',
    configurado: {
      // as NEXT_PUBLIC_* são gravadas no BUILD. Se aparecerem erradas aqui,
      // faltou passá-las como Build Argument, não como Environment.
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      chave_de_servico: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      url_base: urlBase || '(vazia — vai usar o host da requisição)',
      url_base_e_producao: urlBase.startsWith('https://'),
      infinite_pay: Boolean(process.env.INFINITEPAY_HANDLE),
      mercado_pago: Boolean(process.env.MP_ACCESS_TOKEN),
      mercado_pago_navegador: Boolean(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY),
      webhook_assinado: Boolean(process.env.MP_WEBHOOK_SECRET),
      whatsapp: Boolean(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN),
      impressao: Boolean(process.env.TOKEN_IMPRESSAO),
      fuso: process.env.NEXT_PUBLIC_FUSO_HORARIO ?? 'America/Sao_Paulo',
    },
  })
}
