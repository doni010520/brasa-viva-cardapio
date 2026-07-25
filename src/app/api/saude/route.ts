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

export async function GET() {
  const urlBase = process.env.NEXT_PUBLIC_URL_BASE ?? ''

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
      mercado_pago: Boolean(process.env.MP_ACCESS_TOKEN),
      mercado_pago_navegador: Boolean(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY),
      webhook_assinado: Boolean(process.env.MP_WEBHOOK_SECRET),
      whatsapp: Boolean(process.env.UAZAPI_URL && process.env.UAZAPI_TOKEN),
      impressao: Boolean(process.env.TOKEN_IMPRESSAO),
      fuso: process.env.NEXT_PUBLIC_FUSO_HORARIO ?? 'America/Sao_Paulo',
    },
  })
}
