/**
 * Endereços da SEFAZ-BA para NFC-e (layout 4.00).
 *
 * A Bahia é autorizadora própria (não usa SVRS). Qualquer endereço pode
 * ser trocado por variável de ambiente sem novo deploy de código —
 * o diagnóstico (/api/saude?nfce=...) mostra o que está valendo.
 */

export const UF_BA = '29'

export type Ambiente = 1 | 2 // 1 = produção, 2 = homologação

const HOST: Record<Ambiente, string> = {
  1: 'https://nfe.sefaz.ba.gov.br',
  2: 'https://hnfe.sefaz.ba.gov.br',
}

export type Servico = 'autorizacao' | 'retAutorizacao' | 'consulta' | 'status' | 'evento' | 'inutilizacao'

const CAMINHO: Record<Servico, string> = {
  autorizacao: '/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
  retAutorizacao: '/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
  consulta: '/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
  status: '/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
  evento: '/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  inutilizacao: '/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
}

/** namespace do WSDL e a "action" SOAP de cada serviço */
export const WSDL: Record<Servico, { ns: string; acao: string }> = {
  autorizacao: { ns: 'NFeAutorizacao4', acao: 'nfeAutorizacaoLote' },
  retAutorizacao: { ns: 'NFeRetAutorizacao4', acao: 'nfeRetAutorizacaoLote' },
  consulta: { ns: 'NFeConsultaProtocolo4', acao: 'nfeConsultaNF' },
  status: { ns: 'NFeStatusServico4', acao: 'nfeStatusServicoNF' },
  evento: { ns: 'NFeRecepcaoEvento4', acao: 'nfeRecepcaoEvento' },
  inutilizacao: { ns: 'NFeInutilizacao4', acao: 'nfeInutilizacaoNF' },
}

export function urlServico(servico: Servico, ambiente: Ambiente) {
  const host = (ambiente === 1 ? process.env.NFCE_HOST_PRODUCAO : process.env.NFCE_HOST_HOMOLOGACAO) ?? HOST[ambiente]
  return `${host.replace(/\/$/, '')}${CAMINHO[servico]}`
}

/** Página do QR Code (o consumidor abre pelo celular). */
export function urlQrCode(ambiente: Ambiente) {
  return ambiente === 1
    ? (process.env.NFCE_URL_QRCODE_PRODUCAO ?? 'http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx')
    : (process.env.NFCE_URL_QRCODE_HOMOLOGACAO ?? 'http://hnfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx')
}

/** "Consulte pela chave de acesso em" — sai no DANFE e no XML. */
export function urlConsultaChave(ambiente: Ambiente) {
  return ambiente === 1
    ? (process.env.NFCE_URL_CHAVE_PRODUCAO ?? 'http://www.sefaz.ba.gov.br/nfce/consulta')
    : (process.env.NFCE_URL_CHAVE_HOMOLOGACAO ?? 'http://hinternet.sefaz.ba.gov.br/nfce/consulta')
}
