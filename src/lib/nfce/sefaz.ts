import { readFileSync } from 'node:fs'
import https from 'node:https'
import { assinarXml } from './assinatura'
import type { Certificado } from './certificado'
import { dataHoraSefaz } from './chave'
import { NS_NFE } from './xml'
import { UF_BA, WSDL, urlServico, type Ambiente, type Servico } from './sefaz-ba'

/**
 * Conversa com os webservices da SEFAZ-BA (SOAP 1.2 com certificado
 * do cliente no TLS — é o certificado que identifica a empresa).
 *
 * Sobre rejectUnauthorized: o certificado do servidor da SEFAZ é
 * emitido pela cadeia ICP-Brasil, que não vem no repositório de CAs
 * do Node. Por padrão não validamos a cadeia do SERVIDOR (o que vai
 * no canal é a nota, não segredo; a autenticação que importa é a
 * nossa, por certificado). Para validar, aponte NFCE_CA_PEM para um
 * arquivo com as ACs ICP-Brasil.
 */

const TIMEOUT_MS = 30_000

export class ErroComunicacao extends Error {}

function agente(cert: Certificado) {
  const ca = process.env.NFCE_CA_PEM
  return new https.Agent({
    key: cert.chavePem,
    cert: cert.certPem,
    ...(ca ? { ca: readFileSync(ca, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false }),
    keepAlive: false,
  })
}

async function chamar(servico: Servico, ambiente: Ambiente, corpo: string, cert: Certificado) {
  const { ns, acao } = WSDL[servico]
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${ns}">${corpo}</nfeDadosMsg></soap12:Body>` +
    '</soap12:Envelope>'

  const url = new URL(urlServico(servico, ambiente))
  const dados = Buffer.from(envelope, 'utf8')

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        agent: agente(cert),
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/${ns}/${acao}"`,
          'Content-Length': dados.length,
        },
      },
      (res) => {
        const partes: Buffer[] = []
        res.on('data', (p) => partes.push(p))
        res.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8')
          if (res.statusCode === 403) {
            // IIS da SEFAZ devolve 403 quando o certificado do cliente não é ICP-Brasil válido
            reject(new ErroComunicacao('A SEFAZ recusou o certificado (HTTP 403). Confira se é o e-CNPJ A1 da empresa e se está dentro da validade.'))
          } else if ((res.statusCode ?? 500) >= 400 && !texto.includes('cStat')) {
            reject(new ErroComunicacao(`SEFAZ respondeu HTTP ${res.statusCode}: ${texto.slice(0, 300)}`))
          } else resolve(texto)
        })
      }
    )
    req.on('timeout', () => req.destroy(new ErroComunicacao('A SEFAZ não respondeu a tempo.')))
    req.on('error', (e) => reject(e instanceof ErroComunicacao ? e : new ErroComunicacao(`Falha de comunicação com a SEFAZ: ${e.message}`)))
    req.end(dados)
  })
}

// ------------------------------------------------------- leitura das respostas

/** Primeiro valor de uma tag (dentro de um trecho, se informado). */
export function valor(xml: string, nome: string) {
  return xml.match(new RegExp(`<(?:\\w+:)?${nome}[^>]*>([^<]*)</(?:\\w+:)?${nome}>`))?.[1] ?? null
}

/** Trecho bruto de um elemento, com as tags. */
export function trecho(xml: string, nome: string) {
  return xml.match(new RegExp(`<${nome}[\\s>][\\s\\S]*?</${nome}>`))?.[0] ?? null
}

export type Retorno = { cStat: string; motivo: string; bruto: string }

// ------------------------------------------------------------------ serviços

export async function statusServico(ambiente: Ambiente, cert: Certificado): Promise<Retorno> {
  const corpo = `<consStatServ xmlns="${NS_NFE}" versao="4.00"><tpAmb>${ambiente}</tpAmb><cUF>${UF_BA}</cUF><xServ>STATUS</xServ></consStatServ>`
  const bruto = await chamar('status', ambiente, corpo, cert)
  return { cStat: valor(bruto, 'cStat') ?? '?', motivo: valor(bruto, 'xMotivo') ?? bruto.slice(0, 300), bruto }
}

export type RetornoAutorizacao = Retorno & {
  /** cStat/xMotivo da NOTA (protNFe), não do lote */
  protocolo: string | null
  protNFe: string | null
  recebidoEm: string | null
}

/** Envio síncrono (indSinc=1): a NFC-e volta autorizada ou rejeitada na hora. */
export async function autorizar(xmlAssinado: string, ambiente: Ambiente, cert: Certificado): Promise<RetornoAutorizacao> {
  const idLote = String(Date.now()).slice(-15)
  const corpo = `<enviNFe xmlns="${NS_NFE}" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${xmlAssinado}</enviNFe>`
  const bruto = await chamar('autorizacao', ambiente, corpo, cert)
  return lerProtocolo(bruto)
}

function lerProtocolo(bruto: string): RetornoAutorizacao {
  const protNFe = trecho(bruto, 'protNFe')
  const fonte = protNFe ?? bruto // sem protNFe: rejeição do lote inteiro
  return {
    cStat: valor(fonte, 'cStat') ?? '?',
    motivo: valor(fonte, 'xMotivo') ?? bruto.slice(0, 300),
    protocolo: protNFe ? valor(protNFe, 'nProt') : null,
    protNFe,
    recebidoEm: protNFe ? valor(protNFe, 'dhRecbto') : null,
    bruto,
  }
}

/** Situação de uma nota pela chave (resolve envio que ficou sem resposta). */
export async function consultarChave(chave: string, ambiente: Ambiente, cert: Certificado): Promise<RetornoAutorizacao> {
  const corpo = `<consSitNFe xmlns="${NS_NFE}" versao="4.00"><tpAmb>${ambiente}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`
  const bruto = await chamar('consulta', ambiente, corpo, cert)
  return lerProtocolo(bruto)
}

export type RetornoEvento = Retorno & { protocolo: string | null; procEvento: string | null }

/**
 * Cancelamento (evento 110111). NFC-e só cancela em até 30 minutos
 * depois da autorização; a justificativa precisa de 15 a 255 letras.
 */
export async function cancelar(
  dados: { chave: string; protocolo: string; justificativa: string; cnpj: string },
  ambiente: Ambiente,
  cert: Certificado
): Promise<RetornoEvento> {
  const tpEvento = '110111'
  const seq = 1
  const id = `ID${tpEvento}${dados.chave}${String(seq).padStart(2, '0')}`
  const just = dados.justificativa.replace(/\s+/g, ' ').trim()
  if (just.length < 15 || just.length > 255) throw new Error('A justificativa precisa ter de 15 a 255 caracteres.')

  const evento =
    `<evento xmlns="${NS_NFE}" versao="1.00"><infEvento Id="${id}">` +
    `<cOrgao>${UF_BA}</cOrgao><tpAmb>${ambiente}</tpAmb><CNPJ>${dados.cnpj.replace(/\D/g, '')}</CNPJ>` +
    `<chNFe>${dados.chave}</chNFe><dhEvento>${dataHoraSefaz(new Date())}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento><nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${dados.protocolo}</nProt>` +
    `<xJust>${just.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</xJust></detEvento>` +
    '</infEvento></evento>'

  const assinado = assinarXml(evento, cert, { elemento: 'infEvento', depoisDe: 'infEvento' })
  const corpo = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${String(Date.now()).slice(-15)}</idLote>${assinado}</envEvento>`
  const bruto = await chamar('evento', ambiente, corpo, cert)

  const retEvento = trecho(bruto, 'retEvento')
  const fonte = retEvento ?? bruto
  const cStat = valor(fonte, 'cStat') ?? '?'
  return {
    cStat,
    motivo: valor(fonte, 'xMotivo') ?? bruto.slice(0, 300),
    protocolo: retEvento ? valor(retEvento, 'nProt') : null,
    procEvento: retEvento
      ? `<procEventoNFe xmlns="${NS_NFE}" versao="1.00">${assinado}${retEvento}</procEventoNFe>`
      : null,
    bruto,
  }
}

/** Nota + protocolo: o XML que vale juridicamente e que se guarda por 5 anos. */
export function montarNfeProc(xmlAssinado: string, protNFe: string) {
  return `<nfeProc xmlns="${NS_NFE}" versao="4.00">${xmlAssinado}${protNFe}</nfeProc>`
}
