import type { NextRequest } from 'next/server'
import { criarLinkInfinitePay, infinitePayConfigurado } from '@/lib/infinitepay'
import { carregarCertificado, certificadoConfigurado } from '@/lib/nfce/certificado'
import { statusServico } from '@/lib/nfce/sefaz'
import { urlServico } from '@/lib/nfce/sefaz-ba'
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

  // Diagnóstico da NFC-e: abre o certificado e pergunta à SEFAZ-BA se o
  // serviço está no ar (consStatServ). ?nfce=TOKEN&ambiente=1 testa produção;
  // o padrão é homologação. Não emite nada.
  const diagNfce = request.nextUrl.searchParams.get('nfce')
  if (diagNfce && process.env.TOKEN_IMPRESSAO && diagNfce === process.env.TOKEN_IMPRESSAO) {
    const ambiente = request.nextUrl.searchParams.get('ambiente') === '1' ? 1 : 2
    const resposta: Record<string, unknown> = {
      ambiente: ambiente === 1 ? 'producao' : 'homologacao',
      endpoint: urlServico('status', ambiente),
      csc: Boolean(process.env.NFCE_CSC_ID && process.env.NFCE_CSC_TOKEN),
      certificado: certificadoConfigurado() ? 'configurado' : 'ausente',
    }
    if (!certificadoConfigurado()) return Response.json(resposta)
    try {
      const cert = carregarCertificado()
      resposta.certificado = {
        titular: cert.titular,
        cnpj: cert.cnpj,
        valido_ate: cert.validoAte.toISOString(),
        vencido: cert.validoAte.getTime() < Date.now(),
      }
      const status = await statusServico(ambiente, cert)
      resposta.sefaz = { cStat: status.cStat, motivo: status.motivo, em_operacao: status.cStat === '107' }
    } catch (erro) {
      resposta.erro = erro instanceof Error ? erro.message : String(erro)
    }
    return Response.json(resposta)
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
      // as duas metades do push: a pública é gravada no BUILD (Build Argument),
      // a privada é lida no servidor. Faltando uma, o aviso no celular não sai.
      avisos_no_celular: Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ),
      avisos_no_celular_navegador: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      impressao: Boolean(process.env.TOKEN_IMPRESSAO),
      nfce_certificado: Boolean(process.env.NFCE_CERT_PFX_BASE64 && process.env.NFCE_CERT_SENHA),
      nfce_csc: Boolean(process.env.NFCE_CSC_ID && process.env.NFCE_CSC_TOKEN),
      fuso: process.env.NEXT_PUBLIC_FUSO_HORARIO ?? 'America/Sao_Paulo',
    },
  })
}
