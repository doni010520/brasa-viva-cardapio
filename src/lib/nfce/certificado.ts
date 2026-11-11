import forge from 'node-forge'

/**
 * Certificado digital A1 (arquivo .pfx/.p12) da empresa.
 *
 * Fica no AMBIENTE do servidor, nunca no banco nem no git:
 *   NFCE_CERT_PFX_BASE64  conteúdo do .pfx em base64
 *   NFCE_CERT_SENHA       senha do .pfx
 *
 * O .pfx é aberto com node-forge e vira chave + certificado em PEM. Não
 * entregamos o .pfx direto pro TLS do Node porque muito certificado de
 * AC brasileira ainda vem com criptografia antiga (RC2) que o OpenSSL 3
 * recusa ("unsupported") — em PEM o problema some.
 */

export type Certificado = {
  chavePem: string
  certPem: string
  /** CNPJ gravado no certificado (e-CNPJ ICP-Brasil: "RAZAO:CNPJ" no CN) */
  cnpj: string | null
  titular: string
  validoDe: Date
  validoAte: Date
}

let cache: { origem: string; certificado: Certificado } | null = null

export function certificadoConfigurado() {
  return Boolean(process.env.NFCE_CERT_PFX_BASE64 && process.env.NFCE_CERT_SENHA)
}

export function abrirPfx(pfx: Buffer, senha: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const asn1 = forge.asn1.fromDer(pfx.toString('binary'))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
  } catch {
    throw new Error('Não consegui abrir o certificado: arquivo inválido ou senha errada.')
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ]
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined
  if (!chave) throw new Error('O certificado não tem chave privada.')

  // o .pfx costuma trazer a cadeia inteira (AC raiz, intermediária...):
  // o certificado certo é o que casa com a chave privada
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))
  const cert = certs.find((c) => {
    const publica = c.publicKey as forge.pki.rsa.PublicKey
    return publica.n?.equals(chave.n) && publica.e?.equals(chave.e)
  })
  if (!cert) throw new Error('Não achei, dentro do .pfx, o certificado da chave privada.')

  const cn = String(cert.subject.getField('CN')?.value ?? '')
  const cnpj = cn.match(/:(\d{14})\b/)?.[1] ?? null

  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(cert),
    cnpj,
    titular: cn,
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
  }
}

/** Lê o certificado do ambiente (com cache enquanto o env não mudar). */
export function carregarCertificado(): Certificado {
  const base64 = process.env.NFCE_CERT_PFX_BASE64
  const senha = process.env.NFCE_CERT_SENHA
  if (!base64 || !senha) {
    throw new Error('Certificado digital ainda não configurado (NFCE_CERT_PFX_BASE64 e NFCE_CERT_SENHA).')
  }
  const origem = `${base64.length}:${base64.slice(0, 32)}:${base64.slice(-32)}`
  if (cache?.origem === origem) return cache.certificado

  const certificado = abrirPfx(Buffer.from(base64, 'base64'), senha)
  cache = { origem, certificado }
  return certificado
}

/** Só os números do certificado, sem PEM: vai dentro do <X509Certificate>. */
export function certificadoBase64(certPem: string) {
  return certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
}
