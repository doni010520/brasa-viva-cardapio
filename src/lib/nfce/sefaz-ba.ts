/**
 * Endereços da NFC-e da Bahia (layout 4.00).
 *
 * A SEFAZ-BA autoriza só NF-e (modelo 55); a NFC-e (65) da Bahia é
 * autorizada pela SVRS (Sefaz Virtual do RS) — mandar NFC-e pro host da
 * SEFAZ-BA dá rejeição 702. QR Code e consulta pública continuam nos
 * endereços da própria SEFAZ-BA. Qualquer endereço pode
 * ser trocado por variável de ambiente sem novo deploy de código —
 * o diagnóstico (/api/saude?nfce=...) mostra o que está valendo.
 */

export const UF_BA = '29'

export type Ambiente = 1 | 2 // 1 = produção, 2 = homologação

const HOST: Record<Ambiente, string> = {
  1: 'https://nfce.svrs.rs.gov.br',
  2: 'https://nfce-homologacao.svrs.rs.gov.br',
}

export type Servico = 'autorizacao' | 'retAutorizacao' | 'consulta' | 'status' | 'evento' | 'inutilizacao'

const CAMINHO: Record<Servico, string> = {
  autorizacao: '/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  retAutorizacao: '/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
  consulta: '/ws/NfeConsulta/NfeConsulta4.asmx',
  status: '/ws/NfeStatusServico/NfeStatusServico4.asmx',
  evento: '/ws/recepcaoevento/recepcaoevento4.asmx',
  inutilizacao: '/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
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
