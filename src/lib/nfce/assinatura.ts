import { SignedXml } from 'xml-crypto'
import type { Certificado } from './certificado'

/**
 * Assinatura XMLDSig no padrão da SEFAZ: RSA-SHA1, C14N inclusiva,
 * referência ao elemento com Id (infNFe ou infEvento), transforms
 * enveloped-signature + C14N, e o certificado em <X509Data>.
 *
 * O <Signature> entra logo DEPOIS do elemento indicado em `depoisDe`
 * (na NFC-e é depois do infNFeSupl; no evento, depois do infEvento).
 */

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1'

export function assinarXml(
  xml: string,
  certificado: Pick<Certificado, 'chavePem' | 'certPem'>,
  opcoes: { elemento: 'infNFe' | 'infEvento' | 'infInut'; depoisDe: string }
) {
  const assinador = new SignedXml({
    privateKey: certificado.chavePem,
    publicCert: certificado.certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
  })

  assinador.addReference({
    xpath: `//*[local-name(.)='${opcoes.elemento}']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
  })

  assinador.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${opcoes.depoisDe}']`, action: 'after' },
  })

  return assinador.getSignedXml()
}

export function assinarNfce(xml: string, certificado: Pick<Certificado, 'chavePem' | 'certPem'>) {
  return assinarXml(xml, certificado, { elemento: 'infNFe', depoisDe: 'infNFeSupl' })
}

/** Confere a assinatura (usado no teste local e no diagnóstico). */
export function assinaturaConfere(xmlAssinado: string, certPem: string) {
  const conferidor = new SignedXml({ publicCert: certPem })
  const inicio = xmlAssinado.indexOf('<Signature')
  const fim = xmlAssinado.indexOf('</Signature>') + '</Signature>'.length
  conferidor.loadSignature(xmlAssinado.slice(inicio, fim))
  return conferidor.checkSignature(xmlAssinado)
}
