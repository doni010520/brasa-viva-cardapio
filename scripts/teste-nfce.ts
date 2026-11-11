/**
 * Teste OFFLINE da NFC-e: gera um certificado de mentira, monta uma nota,
 * assina e confere a assinatura. Não fala com a SEFAZ.
 *
 *   npx tsx scripts/teste-nfce.ts            (imprime o XML no fim)
 *   npx tsx scripts/teste-nfce.ts --quieto
 *
 * Se existir NFCE_XSD_DIR (pasta com os XSD do pacote PL_009 da SEFAZ) e o
 * xmllint no PATH, valida o XML contra o schema oficial também.
 */
import forge from 'node-forge'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirPfx } from '../src/lib/nfce/certificado'
import { assinarNfce, assinaturaConfere, assinarXml } from '../src/lib/nfce/assinatura'
import { digitoVerificador } from '../src/lib/nfce/chave'
import { montarNfce, ratear, type DadosNota } from '../src/lib/nfce/xml'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'OK  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) falhas++
}

// --- certificado de mentira, no formato de um e-CNPJ ---
const chaves = forge.pki.rsa.generateKeyPair(2048)
const cert = forge.pki.createCertificate()
cert.publicKey = chaves.publicKey
cert.serialNumber = '01'
cert.validity.notBefore = new Date()
cert.validity.notAfter = new Date(Date.now() + 365 * 864e5)
const nome = [{ name: 'commonName', value: 'CHURRASCARIA TESTE LTDA:52270250000145' }]
cert.setSubject(nome)
cert.setIssuer(nome)
cert.sign(chaves.privateKey, forge.md.sha256.create())
const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], 'senha123', { algorithm: '3des' })
const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')

const certificado = abrirPfx(pfx, 'senha123')
confere('abre o .pfx e acha o CNPJ', certificado.cnpj === '52270250000145', String(certificado.cnpj))
let senhaErrada = false
try {
  abrirPfx(pfx, 'errada')
} catch {
  senhaErrada = true
}
confere('senha errada dá erro claro', senhaErrada)

// --- regras soltas ---
confere('DV da chave (exemplo do manual)', digitoVerificador('5206043300991100250655012000000780026730161') === 5)
const r = ratear(1000, [3333, 3333, 3334])
confere('rateio não perde centavo', r.reduce((a, b) => a + b, 0) === 1000, r.join(','))

// --- nota de exemplo: marmitex + refri, cupom de R$ 5 e entrega R$ 6 ---
const dados: DadosNota = {
  ambiente: 2,
  serie: 1,
  numero: 7,
  emissao: new Date(),
  emitente: {
    cnpj: '52.270.250/0001-45',
    razaoSocial: 'Churrascaria Teste & Cia Ltda',
    nomeFantasia: 'Brasa Viva',
    inscricaoEstadual: '123.456.789',
    crt: 1,
    logradouro: 'Rua Cristo Rei',
    numero: '10',
    complemento: null,
    bairro: 'Centro',
    municipioIbge: '2910057',
    municipio: "Dias d'Avila",
    uf: 'BA',
    cep: '42850-000',
    telefone: '(71) 98662-9488',
  },
  itens: [
    { codigo: 'p1', descricao: 'Marmitex da casa — 2 carnes', quantidade: 2, totalCentavos: 5000, ncm: '21069090', cfop: '5102', csosn: '102', cest: null },
    { codigo: 'p2', descricao: 'Refrigerante lata', quantidade: 1, totalCentavos: 600, ncm: '22021000', cfop: '5405', csosn: '500', cest: '0300700' },
  ],
  descontoCentavos: 500,
  outrosCentavos: 600,
  totalCentavos: 5700,
  pagamento: { codigo: '01', valorCentavos: 6000 },
  cpfConsumidor: '123.456.789-09',
  entregaEmDomicilio: true,
  infoComplementar: 'Pedido #123',
  csc: { id: '000001', token: 'TOKEN-DE-TESTE' },
}

const nota = montarNfce(dados)
confere('chave com 44 dígitos', /^\d{44}$/.test(nota.chave), nota.chave)
confere('DV bate', digitoVerificador(nota.chave.slice(0, 43)) === Number(nota.chave[43]))
confere('texto de homologação no 1º item', nota.xml.includes('<xProd>NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xProd>'))
confere('& escapado', nota.xml.includes('Teste &amp; Cia'))
confere('total da nota', nota.xml.includes('<vNF>57.00</vNF>'))
confere('troco', nota.xml.includes('<vTroco>3.00</vTroco>'))
confere('QR Code v2', /\?p=\d{44}\|2\|2\|1\|[0-9A-F]{40}$/.test(nota.qrcode), nota.qrcode)

// desconto e acréscimo rateados somam o total
const descs = [...nota.xml.matchAll(/<vDesc>([\d.]+)<\/vDesc>/g)].map((m) => Number(m[1]))
confere('rateio do desconto', Math.abs(descs.slice(0, -1).reduce((a, b) => a + b, 0) - 5) < 1e-9, descs.join(','))

let contaErrada = false
try {
  montarNfce({ ...dados, totalCentavos: 9999 })
} catch {
  contaErrada = true
}
confere('recusa nota com conta que não fecha', contaErrada)

let semCest = false
try {
  montarNfce({ ...dados, itens: [{ ...dados.itens[1], cest: null }], descontoCentavos: 0, outrosCentavos: 0, totalCentavos: 600 })
} catch {
  semCest = true
}
confere('recusa ST sem CEST', semCest)

// --- assinatura ---
const assinado = assinarNfce(nota.xml, certificado)
const posSupl = assinado.indexOf('</infNFeSupl>')
const posSig = assinado.indexOf('<Signature')
confere('Signature depois do infNFeSupl', posSupl > 0 && posSig > posSupl)
confere('referência ao Id da nota', assinado.includes(`URI="#NFe${nota.chave}"`))
confere('RSA-SHA1 + C14N', assinado.includes('xmldsig#rsa-sha1') && assinado.includes('REC-xml-c14n-20010315'))
confere('certificado no X509Data', assinado.includes('<X509Certificate>'))
confere('assinatura confere', assinaturaConfere(assinado, certificado.certPem))

const adulterado = assinado.replace('<vNF>57.00</vNF>', '<vNF>1.00</vNF>')
let pegouAdulteracao = false
try {
  pegouAdulteracao = !assinaturaConfere(adulterado, certificado.certPem)
} catch {
  pegouAdulteracao = true
}
confere('assinatura denuncia nota adulterada', pegouAdulteracao)

const evento = assinarXml(
  `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="ID110111${nota.chave}01"><cOrgao>29</cOrgao></infEvento></evento>`,
  certificado,
  { elemento: 'infEvento', depoisDe: 'infEvento' }
)
confere('assina evento de cancelamento', evento.includes(`URI="#ID110111${nota.chave}01"`) && assinaturaConfere(evento, certificado.certPem))

// --- schema oficial, se disponível ---
const xsdDir = process.env.NFCE_XSD_DIR
if (xsdDir) {
  const pasta = mkdtempSync(join(tmpdir(), 'nfce-'))
  const arquivo = join(pasta, 'nota.xml')
  writeFileSync(arquivo, assinado)
  try {
    execFileSync('xmllint', ['--noout', '--schema', join(xsdDir, 'nfe_v4.00.xsd'), arquivo], { stdio: 'pipe' })
    confere('valida no XSD oficial', true)
  } catch (e) {
    confere('valida no XSD oficial', false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 800))
  }
}

if (!process.argv.includes('--quieto')) console.log('\n' + assinado)
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
