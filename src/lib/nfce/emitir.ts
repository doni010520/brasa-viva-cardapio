import { buscarConfiguracoes } from '@/lib/dados'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Configuracoes, Pedido } from '@/lib/types'
import { assinarNfce } from './assinatura'
import { carregarCertificado, certificadoConfigurado } from './certificado'
import { autorizar, cancelar, consultarChave, ErroComunicacao, montarNfeProc } from './sefaz'
import type { Ambiente } from './sefaz-ba'
import { montarNfce, type CodigoPagamento, type DadosNota, type ItemNota } from './xml'

/**
 * Emissão da NFC-e de um pedido, de ponta a ponta:
 * confere pendências → pega número → monta → assina → envia → guarda.
 *
 * Regras que evitam dor de cabeça com o fisco:
 * - Uma nota válida por pedido (índice único no banco).
 * - Número só sai da função do banco, nunca calculado aqui.
 * - Nota REJEITADA não gastou o número: a próxima tentativa do mesmo
 *   pedido reaproveita (senão vira buraco que precisa ser inutilizado).
 * - Envio que caiu sem resposta fica 'erro' e, antes de tentar de novo,
 *   consultamos a chave na SEFAZ — pode ter sido autorizada.
 */

export type NotaFiscal = {
  id: string
  pedido_id: string
  serie: number
  numero: number
  ambiente: Ambiente
  chave: string
  status: 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro'
  cstat: string | null
  motivo: string | null
  protocolo: string | null
  valor_centavos: number
  cpf_consumidor: string | null
  xml: string | null
  qrcode: string | null
  criado_em: string
  autorizada_em: string | null
  cancelada_em: string | null
}

export type ResultadoEmissao =
  | { ok: true; nota: NotaFiscal }
  | { ok: false; erro: string; nota?: NotaFiscal }

const MOTIVOS_DUPLICIDADE = ['204', '539']

// ------------------------------------------------------------- pendências

/** O que ainda falta para emitir. Lista vazia = pronto. */
export function pendenciasNfce(config: Configuracoes): string[] {
  const faltas: string[] = []
  if (!certificadoConfigurado()) faltas.push('certificado digital A1 (NFCE_CERT_PFX_BASE64 + NFCE_CERT_SENHA)')
  if (!process.env.NFCE_CSC_ID || !process.env.NFCE_CSC_TOKEN) faltas.push('CSC da SEFAZ-BA (NFCE_CSC_ID + NFCE_CSC_TOKEN)')
  if ((config.cnpj ?? '').replace(/\D/g, '').length !== 14) faltas.push('CNPJ')
  if (!config.razao_social) faltas.push('razão social')
  if (!config.inscricao_estadual) faltas.push('inscrição estadual')
  if (!config.fiscal_logradouro || !config.fiscal_numero || !config.fiscal_bairro) faltas.push('endereço fiscal')
  if ((config.fiscal_cep ?? '').replace(/\D/g, '').length !== 8) faltas.push('CEP fiscal')
  return faltas
}

// ------------------------------------------------------------- pagamento

/**
 * Forma de pagamento que já dá pra saber pelo pedido. Pedido pago no
 * balcão volta null: quem emite escolhe (dinheiro, cartão, pix...).
 */
export function pagamentoDoPedido(pedido: Pedido): CodigoPagamento | null {
  if (pedido.forma_pagamento !== 'online') return null
  const m = (pedido.metodo_pagamento ?? '').toLowerCase()
  if (m === 'pix') return '17'
  if (m.includes('deb')) return '04'
  if (m) return '03' // credit_card, visa, master, elo...
  return '99'
}

// ------------------------------------------------------------- montagem

function emitente(config: Configuracoes): DadosNota['emitente'] {
  return {
    cnpj: config.cnpj ?? '',
    razaoSocial: config.razao_social ?? '',
    nomeFantasia: config.nome,
    inscricaoEstadual: config.inscricao_estadual ?? '',
    crt: config.crt,
    logradouro: config.fiscal_logradouro ?? '',
    numero: config.fiscal_numero ?? '',
    complemento: config.fiscal_complemento,
    bairro: config.fiscal_bairro ?? '',
    municipioIbge: config.fiscal_municipio_ibge,
    municipio: config.fiscal_municipio,
    uf: config.fiscal_uf,
    cep: config.fiscal_cep ?? '',
    telefone: config.telefone,
  }
}

async function itensDaNota(pedido: Pedido, config: Configuracoes): Promise<ItemNota[]> {
  const supabase = criarClienteAdmin()
  const ids = [...new Set((pedido.itens ?? []).map((i) => i.produto_id).filter(Boolean))] as string[]
  const { data: produtos } = ids.length
    ? await supabase.from('produtos').select('id, ncm, cfop, csosn, cest').in('id', ids)
    : { data: [] }
  const regra = new Map((produtos ?? []).map((p) => [p.id as string, p]))

  return (pedido.itens ?? []).map((item, idx) => {
    const p = item.produto_id ? regra.get(item.produto_id) : undefined
    // opções que mudam o prato entram na descrição (o fiscal lê "Marmitex - Picanha, Frango")
    const opcoes = item.opcoes.map((o) => ((o.quantidade ?? 1) > 1 ? `${o.quantidade}x ${o.nome}` : o.nome))
    return {
      codigo: item.produto_id ? item.produto_id.slice(0, 8) : `ITEM${idx + 1}`,
      descricao: opcoes.length ? `${item.produto_nome} - ${opcoes.join(', ')}` : item.produto_nome,
      quantidade: item.quantidade,
      totalCentavos: item.total_centavos,
      ncm: p?.ncm || config.nfce_ncm_padrao,
      cfop: p?.cfop || config.nfce_cfop_padrao,
      csosn: p?.csosn || config.nfce_csosn_padrao,
      cest: p?.cest || null,
    }
  })
}

function respTecnico(): DadosNota['respTecnico'] {
  const { NFCE_RESP_CNPJ: cnpj, NFCE_RESP_CONTATO: contato, NFCE_RESP_EMAIL: email, NFCE_RESP_FONE: fone } = process.env
  return cnpj && contato && email && fone ? { cnpj, contato, email, fone } : null
}

// ------------------------------------------------------------- emissão

async function guardarAutorizada(id: string, xmlAssinado: string, protNFe: string, protocolo: string | null, motivo: string, cStat: string) {
  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('notas_fiscais')
    .update({
      status: 'autorizada',
      cstat: cStat,
      motivo,
      protocolo,
      xml: montarNfeProc(xmlAssinado, protNFe),
      autorizada_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  // DANFE sai na térmica pela fila que já existe
  await supabase.from('impressoes').insert({ pedido_id: (data as NotaFiscal).pedido_id, via: 'nfce' })
  return data as NotaFiscal
}

/** XML assinado puro (sem nfeProc), para reenviar/montar o nfeProc. */
function xmlAssinadoDe(nota: NotaFiscal) {
  return nota.xml ?? ''
}

/**
 * Nota que ficou no limbo (sem resposta da SEFAZ): pergunta pela chave.
 * Devolve a nota resolvida, ou null se a SEFAZ não conhece a chave.
 */
async function resolverPendente(nota: NotaFiscal): Promise<NotaFiscal | null> {
  const supabase = criarClienteAdmin()
  const consulta = await consultarChave(nota.chave, nota.ambiente, carregarCertificado())
  if (['100', '150'].includes(consulta.cStat) && consulta.protNFe) {
    return guardarAutorizada(nota.id, xmlAssinadoDe(nota), consulta.protNFe, consulta.protocolo, consulta.motivo, consulta.cStat)
  }
  if (consulta.cStat === '217') {
    // "NF-e não consta na base": o número continua livre
    await supabase.from('notas_fiscais').update({ status: 'rejeitada', cstat: '217', motivo: consulta.motivo }).eq('id', nota.id)
    return null
  }
  throw new Error(`Não consegui confirmar a nota anterior (${consulta.cStat}: ${consulta.motivo}). Tente de novo em instantes.`)
}

export async function emitirNfce(
  pedidoId: string,
  opcoes: { cpf?: string | null; pagamento?: CodigoPagamento | null; valorPagoCentavos?: number | null }
): Promise<ResultadoEmissao> {
  const supabase = criarClienteAdmin()
  const config = await buscarConfiguracoes()

  const faltas = pendenciasNfce(config)
  if (faltas.length) return { ok: false, erro: `Antes de emitir, falta: ${faltas.join('; ')}.` }

  const { data: pedidoBruto } = await supabase
    .from('pedidos')
    .select('*, itens:pedido_itens(*)')
    .eq('id', pedidoId)
    .maybeSingle()
  if (!pedidoBruto) return { ok: false, erro: 'Pedido não encontrado.' }
  const pedido = pedidoBruto as Pedido
  if (pedido.status === 'cancelado') return { ok: false, erro: 'Pedido cancelado não leva nota.' }

  const ambiente = config.nfce_ambiente as Ambiente
  const serie = config.nfce_serie

  // ---- o que já existe pra esse pedido?
  const { data: anteriores } = await supabase
    .from('notas_fiscais')
    .select('*')
    .eq('pedido_id', pedidoId)
    .eq('ambiente', ambiente)
    .order('criado_em', { ascending: false })
  const notas = (anteriores ?? []) as NotaFiscal[]

  const valida = notas.find((n) => n.status === 'autorizada')
  if (valida) return { ok: true, nota: valida }

  try {
    for (const n of notas.filter((n) => n.status === 'processando' || n.status === 'erro')) {
      const resolvida = await resolverPendente(n)
      if (resolvida) return { ok: true, nota: resolvida }
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }

  // número reaproveitado de rejeição (da mesma série), ou um novo
  const reaproveitar = notas.find((n) => n.serie === serie && (n.status === 'rejeitada' || n.status === 'erro'))
  let numero = reaproveitar?.numero
  if (!numero) {
    const { data, error } = await supabase.rpc('proximo_numero_nfce', { p_serie: serie, p_ambiente: ambiente })
    if (error || !data) return { ok: false, erro: 'Não consegui reservar o número da nota.' }
    numero = data as number
  }

  const pagamento = opcoes.pagamento ?? pagamentoDoPedido(pedido)
  if (!pagamento) return { ok: false, erro: 'Escolha a forma de pagamento (pedido pago no balcão).' }

  // ---- monta e assina
  let montada: ReturnType<typeof montarNfce>
  let assinado: string
  try {
    const certificado = carregarCertificado()
    montada = montarNfce({
      ambiente,
      serie,
      numero,
      emissao: new Date(),
      emitente: emitente(config),
      itens: await itensDaNota(pedido, config),
      descontoCentavos: pedido.desconto_centavos,
      outrosCentavos: pedido.entrega_taxa_centavos,
      totalCentavos: pedido.total_centavos,
      pagamento: {
        codigo: pagamento,
        valorCentavos: Math.max(opcoes.valorPagoCentavos ?? 0, pedido.total_centavos),
        descricao: pedido.forma_pagamento === 'online' ? 'Pagamento online' : undefined,
      },
      cpfConsumidor: opcoes.cpf?.replace(/\D/g, '') || null,
      entregaEmDomicilio: pedido.tipo_entrega === 'entrega',
      infoComplementar: `Pedido #${String(pedido.numero).padStart(3, '0')}`,
      csc: { id: process.env.NFCE_CSC_ID ?? '', token: process.env.NFCE_CSC_TOKEN ?? '' },
      respTecnico: respTecnico(),
    })
    assinado = assinarNfce(montada.xml, certificado)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }

  // ---- registra ANTES de enviar: se o servidor cair no meio, a chave fica guardada
  const registro = {
    pedido_id: pedidoId,
    serie,
    numero,
    ambiente,
    chave: montada.chave,
    status: 'processando',
    cstat: null,
    motivo: null,
    valor_centavos: pedido.total_centavos,
    cpf_consumidor: opcoes.cpf?.replace(/\D/g, '') || null,
    xml: assinado,
    qrcode: montada.qrcode,
  }
  const gravacao = reaproveitar
    ? await supabase.from('notas_fiscais').update({ ...registro, criado_em: new Date().toISOString() }).eq('id', reaproveitar.id).select('*').single()
    : await supabase.from('notas_fiscais').insert(registro).select('*').single()
  if (gravacao.error || !gravacao.data) {
    return { ok: false, erro: 'Já existe uma nota em andamento para este pedido. Atualize a tela.' }
  }
  const nota = gravacao.data as NotaFiscal

  // ---- envia
  try {
    const retorno = await autorizar(assinado, ambiente, carregarCertificado())

    if (['100', '150'].includes(retorno.cStat) && retorno.protNFe) {
      return { ok: true, nota: await guardarAutorizada(nota.id, assinado, retorno.protNFe, retorno.protocolo, retorno.motivo, retorno.cStat) }
    }
    if (MOTIVOS_DUPLICIDADE.includes(retorno.cStat)) {
      const resolvida = await resolverPendente(nota)
      if (resolvida) return { ok: true, nota: resolvida }
    }

    const { data } = await supabase
      .from('notas_fiscais')
      .update({ status: 'rejeitada', cstat: retorno.cStat, motivo: retorno.motivo })
      .eq('id', nota.id)
      .select('*')
      .single()
    return { ok: false, erro: `SEFAZ recusou (${retorno.cStat}): ${retorno.motivo}`, nota: data as NotaFiscal }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    await supabase
      .from('notas_fiscais')
      .update({ status: 'erro', motivo })
      .eq('id', nota.id)
    return {
      ok: false,
      erro:
        e instanceof ErroComunicacao
          ? `${motivo} A nota ficou guardada; tente emitir de novo que eu confiro na SEFAZ antes.`
          : motivo,
    }
  }
}

// ------------------------------------------------------------- cancelamento

export async function cancelarNfce(notaId: string, justificativa: string): Promise<ResultadoEmissao> {
  const supabase = criarClienteAdmin()
  const { data } = await supabase.from('notas_fiscais').select('*').eq('id', notaId).maybeSingle()
  const nota = data as NotaFiscal | null
  if (!nota) return { ok: false, erro: 'Nota não encontrada.' }
  if (nota.status !== 'autorizada' || !nota.protocolo) return { ok: false, erro: 'Só nota autorizada pode ser cancelada.' }

  const config = await buscarConfiguracoes()
  try {
    const retorno = await cancelar(
      { chave: nota.chave, protocolo: nota.protocolo, justificativa, cnpj: config.cnpj ?? '' },
      nota.ambiente,
      carregarCertificado()
    )
    // 135 = evento registrado; 155 = cancelamento fora do prazo homologado
    if (['135', '155'].includes(retorno.cStat)) {
      const { data: atualizada } = await supabase
        .from('notas_fiscais')
        .update({
          status: 'cancelada',
          protocolo_cancelamento: retorno.protocolo,
          justificativa_cancelamento: justificativa,
          xml_cancelamento: retorno.procEvento,
          cancelada_em: new Date().toISOString(),
        })
        .eq('id', nota.id)
        .select('*')
        .single()
      return { ok: true, nota: atualizada as NotaFiscal }
    }
    return { ok: false, erro: `SEFAZ não cancelou (${retorno.cStat}): ${retorno.motivo}` }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
