import { createHash } from 'node:crypto'
import { codigoNumerico, dataHoraSefaz, montarChave } from './chave'
import { UF_BA, urlConsultaChave, urlQrCode, type Ambiente } from './sefaz-ba'

/**
 * Monta o XML da NFC-e (modelo 65, layout 4.00), ainda SEM assinatura.
 *
 * Escopo fiscal suportado (o caso do Brasa Viva): emitente do Simples
 * Nacional (CRT 1/2/4), venda dentro do estado, consumidor final.
 * Regime normal (CRT 3) exige grupos de ICMS com base de cálculo que
 * não estão aqui — barramos com erro claro em vez de emitir errado.
 *
 * Tudo em centavos até a última hora; só vira "12.34" na escrita.
 */

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
const TEXTO_HOMOLOGACAO = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'

export type Emitente = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  inscricaoEstadual: string
  crt: number
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  municipioIbge: string
  municipio: string
  uf: string
  cep: string
  telefone: string | null
}

export type ItemNota = {
  codigo: string
  descricao: string
  quantidade: number
  /** valor total do item (já com opções), antes de desconto/acréscimo */
  totalCentavos: number
  ncm: string
  cfop: string
  csosn: string
  cest: string | null
}

/** Códigos da tabela tPag da SEFAZ que a casa usa. */
export const FORMAS_PAGAMENTO = {
  '01': 'Dinheiro',
  '03': 'Cartão de crédito',
  '04': 'Cartão de débito',
  '17': 'Pix (dinâmico)',
  '20': 'Pix (estático / chave)',
  '99': 'Outros',
} as const
export type CodigoPagamento = keyof typeof FORMAS_PAGAMENTO

export type DadosNota = {
  ambiente: Ambiente
  serie: number
  numero: number
  emissao: Date
  emitente: Emitente
  itens: ItemNota[]
  descontoCentavos: number
  /** taxa de entrega e afins: vão como "outras despesas" (NFC-e não leva frete) */
  outrosCentavos: number
  totalCentavos: number
  pagamento: { codigo: CodigoPagamento; valorCentavos: number; descricao?: string }
  cpfConsumidor: string | null
  /** pedido entregue em casa (indPres 4) ou presencial (indPres 1) */
  entregaEmDomicilio: boolean
  /** cliente e endereço de entrega — obrigatório na NFC-e de entrega (indPres 4) */
  destinatario?: {
    nome: string | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cep: string | null
    municipioIbge: string
    municipio: string
    uf: string
    telefone: string | null
  } | null
  infoComplementar: string | null
  csc: { id: string; token: string }
  respTecnico?: { cnpj: string; contato: string; email: string; fone: string } | null
}

export type NotaMontada = {
  chave: string
  xml: string // <NFe> completo com infNFeSupl, sem <Signature>
  qrcode: string
  urlChave: string
}

// ----------------------------------------------------------------- utilidades

function esc(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Texto aceito pela SEFAZ: sem quebra de linha, sem espaço duplo, sem ponta. */
function texto(valor: string, max: number) {
  const limpo = valor
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7EÀ-ÿ]/g, '') // fora emoji e afins
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
  return esc(limpo)
}

function tag(nome: string, valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === '') return ''
  return `<${nome}>${valor}</${nome}>`
}

const reais = (centavos: number) => (centavos / 100).toFixed(2)
const digitos = (v: string) => v.replace(/\D/g, '')

/**
 * Reparte um valor entre os itens na proporção do valor de cada um,
 * sem perder centavo (maiores restos levam o que sobrar).
 */
export function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0)
  if (total === 0 || soma === 0) return pesos.map(() => 0)
  const brutos = pesos.map((p) => (total * p) / soma)
  const partes = brutos.map(Math.floor)
  let sobra = total - partes.reduce((a, b) => a + b, 0)
  const ordem = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto)
  for (let k = 0; sobra > 0; k = (k + 1) % ordem.length, sobra--) partes[ordem[k].i]++
  return partes
}

// ----------------------------------------------------------------- validação

export function conferirDados(d: DadosNota) {
  const e = d.emitente
  const faltas: string[] = []
  if (digitos(e.cnpj).length !== 14) faltas.push('CNPJ do emitente')
  if (!e.razaoSocial.trim()) faltas.push('razão social')
  if (!digitos(e.inscricaoEstadual)) faltas.push('inscrição estadual')
  if (!e.logradouro.trim() || !e.numero.trim() || !e.bairro.trim()) faltas.push('endereço fiscal (rua, número, bairro)')
  if (digitos(e.cep).length !== 8) faltas.push('CEP fiscal')
  if (digitos(e.municipioIbge).length !== 7) faltas.push('código IBGE do município')
  if (!d.csc.id || !d.csc.token) faltas.push('CSC (NFCE_CSC_ID / NFCE_CSC_TOKEN)')
  if (faltas.length) throw new Error(`Falta preencher: ${faltas.join(', ')}.`)

  if (e.crt === 3) {
    throw new Error('Emissão preparada só para Simples Nacional/MEI. Regime normal (CRT 3) precisa de ajuste com a contabilidade.')
  }
  if (!d.itens.length) throw new Error('Pedido sem itens.')
  for (const item of d.itens) {
    if (item.quantidade <= 0 || item.totalCentavos <= 0) {
      throw new Error(`Item "${item.descricao}" sem valor: nota fiscal não aceita item zerado.`)
    }
    if (digitos(item.ncm).length !== 8) throw new Error(`NCM inválido em "${item.descricao}" (precisa de 8 dígitos).`)
    if (!/^5\d{3}$/.test(item.cfop)) throw new Error(`CFOP "${item.cfop}" inválido em "${item.descricao}" (venda dentro do estado começa com 5).`)
    if (!['101', '102', '103', '300', '400', '500'].includes(item.csosn)) {
      throw new Error(`CSOSN "${item.csosn}" não suportado em "${item.descricao}".`)
    }
    if (item.csosn === '500' && digitos(item.cest ?? '').length !== 7) {
      throw new Error(`"${item.descricao}" tem substituição tributária (CSOSN 500): falta o CEST.`)
    }
  }
  const produtos = d.itens.reduce((a, i) => a + i.totalCentavos, 0)
  const esperado = produtos - d.descontoCentavos + d.outrosCentavos
  if (esperado !== d.totalCentavos) {
    throw new Error(
      `A conta não fecha: itens ${reais(produtos)} - desconto ${reais(d.descontoCentavos)} + acréscimos ${reais(
        d.outrosCentavos
      )} = ${reais(esperado)}, mas o pedido vale ${reais(d.totalCentavos)}.`
    )
  }
  if (d.pagamento.valorCentavos < d.totalCentavos) throw new Error('Pagamento menor que o total da nota.')
  if (d.cpfConsumidor && digitos(d.cpfConsumidor).length !== 11) throw new Error('CPF do consumidor inválido.')
}

// ----------------------------------------------------------------- QR Code

/**
 * QR Code versão 2, emissão online:
 *   URL?p=chave|2|tpAmb|idCSC|hash
 *   hash = SHA1("chave|2|tpAmb|idCSC" + CSC) em hexadecimal maiúsculo
 * O idCSC vai sem zeros à esquerda.
 */
export function montarQrCode(chave: string, ambiente: Ambiente, csc: { id: string; token: string }) {
  const idCsc = String(Number(csc.id))
  const base = `${chave}|2|${ambiente}|${idCsc}`
  const hash = createHash('sha1').update(base + csc.token).digest('hex').toUpperCase()
  return `${urlQrCode(ambiente)}?p=${base}|${hash}`
}

// ----------------------------------------------------------------- XML

function grupoIcms(csosn: string) {
  // 101 tem crédito de ICMS (pCredSN/vCredICMSSN) — no varejo pra consumidor
  // final quase não se usa; se a contabilidade pedir, cai no erro abaixo.
  if (['102', '103', '300', '400'].includes(csosn)) {
    return `<ICMSSN102><orig>0</orig><CSOSN>${csosn}</CSOSN></ICMSSN102>`
  }
  if (csosn === '500') return `<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN></ICMSSN500>`
  throw new Error(`CSOSN ${csosn} ainda não implementado.`)
}

/** PIS/COFINS do Simples: recolhidos no DAS, na nota vão zerados (CST 49). */
const PIS = '<PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>'
const COFINS =
  '<COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>'

export function montarNfce(d: DadosNota): NotaMontada {
  conferirDados(d)

  const e = d.emitente
  const cnpj = digitos(e.cnpj)
  const cNF = codigoNumerico(d.numero)
  const tpEmis = 1
  const { chave, dv } = montarChave({
    cUF: UF_BA,
    emissao: d.emissao,
    cnpj,
    modelo: 65,
    serie: d.serie,
    numero: d.numero,
    tpEmis,
    cNF,
  })

  const indPres = d.entregaEmDomicilio ? 4 : 1

  const ide =
    '<ide>' +
    tag('cUF', UF_BA) +
    tag('cNF', cNF) +
    tag('natOp', 'VENDA') +
    tag('mod', 65) +
    tag('serie', d.serie) +
    tag('nNF', d.numero) +
    tag('dhEmi', dataHoraSefaz(d.emissao)) +
    tag('tpNF', 1) +
    tag('idDest', 1) +
    tag('cMunFG', digitos(e.municipioIbge)) +
    tag('tpImp', 4) +
    tag('tpEmis', tpEmis) +
    tag('cDV', dv) +
    tag('tpAmb', d.ambiente) +
    tag('finNFe', 1) +
    tag('indFinal', 1) +
    tag('indPres', indPres) +
    tag('indIntermed', 0) +
    tag('procEmi', 0) +
    tag('verProc', 'brasaviva-nfce-1.0') +
    '</ide>'

  const emit =
    '<emit>' +
    tag('CNPJ', cnpj) +
    tag('xNome', texto(e.razaoSocial, 60)) +
    tag('xFant', e.nomeFantasia ? texto(e.nomeFantasia, 60) : null) +
    '<enderEmit>' +
    tag('xLgr', texto(e.logradouro, 60)) +
    tag('nro', texto(e.numero, 60)) +
    tag('xCpl', e.complemento ? texto(e.complemento, 60) : null) +
    tag('xBairro', texto(e.bairro, 60)) +
    tag('cMun', digitos(e.municipioIbge)) +
    tag('xMun', texto(e.municipio, 60)) +
    tag('UF', e.uf) +
    tag('CEP', digitos(e.cep)) +
    tag('cPais', 1058) +
    tag('xPais', 'BRASIL') +
    tag('fone', e.telefone && digitos(e.telefone).length >= 6 ? digitos(e.telefone).slice(-14) : null) +
    '</enderEmit>' +
    tag('IE', digitos(e.inscricaoEstadual)) +
    tag('CRT', e.crt) +
    '</emit>'

  // Destinatário: no balcão só aparece se o cliente pediu CPF na nota. Na
  // entrega a domicílio (indPres 4) é obrigatório (rejeição 787): vai nome e
  // endereço de entrega; sem CPF, a identificação segue com idEstrangeiro
  // vazio (aceito pelo schema para consumidor não identificado).
  const dd = d.entregaEmDomicilio ? d.destinatario ?? null : null
  const dest =
    d.cpfConsumidor || dd
      ? '<dest>' +
        (d.cpfConsumidor ? tag('CPF', digitos(d.cpfConsumidor)) : '<idEstrangeiro/>') +
        (d.ambiente === 2
          ? tag('xNome', 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL')
          : dd?.nome
            ? tag('xNome', texto(dd.nome, 60))
            : '') +
        (dd
          ? '<enderDest>' +
            tag('xLgr', texto(dd.logradouro || 'NAO INFORMADO', 60)) +
            tag('nro', texto(dd.numero || 'S/N', 60)) +
            (dd.complemento ? tag('xCpl', texto(dd.complemento, 60)) : '') +
            tag('xBairro', texto(dd.bairro || 'NAO INFORMADO', 60)) +
            tag('cMun', dd.municipioIbge) +
            tag('xMun', texto(dd.municipio, 60)) +
            tag('UF', dd.uf) +
            (dd.cep && digitos(dd.cep).length === 8 ? tag('CEP', digitos(dd.cep)) : '') +
            tag('cPais', 1058) +
            tag('xPais', 'BRASIL') +
            (dd.telefone && digitos(dd.telefone).length >= 6 ? tag('fone', digitos(dd.telefone).slice(-14)) : '') +
            '</enderDest>'
          : '') +
        tag('indIEDest', 9) +
        '</dest>'
      : ''

  const pesos = d.itens.map((i) => i.totalCentavos)
  const descontos = ratear(d.descontoCentavos, pesos)
  const outros = ratear(d.outrosCentavos, pesos)

  const dets = d.itens
    .map((item, idx) => {
      // em homologação a SEFAZ exige esse texto na descrição do 1º item
      const descricao = d.ambiente === 2 && idx === 0 ? TEXTO_HOMOLOGACAO : texto(item.descricao, 120)
      const qtd = item.quantidade.toFixed(4)
      const unit = (item.totalCentavos / item.quantidade / 100).toFixed(10).replace(/0{1,8}$/, '')
      return (
        `<det nItem="${idx + 1}">` +
        '<prod>' +
        tag('cProd', texto(item.codigo, 60)) +
        tag('cEAN', 'SEM GTIN') +
        tag('xProd', descricao) +
        tag('NCM', digitos(item.ncm)) +
        tag('CEST', item.cest ? digitos(item.cest) : null) +
        tag('CFOP', item.cfop) +
        tag('uCom', 'UN') +
        tag('qCom', qtd) +
        tag('vUnCom', unit) +
        tag('vProd', reais(item.totalCentavos)) +
        tag('cEANTrib', 'SEM GTIN') +
        tag('uTrib', 'UN') +
        tag('qTrib', qtd) +
        tag('vUnTrib', unit) +
        (descontos[idx] > 0 ? tag('vDesc', reais(descontos[idx])) : '') +
        (outros[idx] > 0 ? tag('vOutro', reais(outros[idx])) : '') +
        tag('indTot', 1) +
        '</prod>' +
        '<imposto>' +
        `<ICMS>${grupoIcms(item.csosn)}</ICMS>` +
        PIS +
        COFINS +
        '</imposto>' +
        '</det>'
      )
    })
    .join('')

  const vProd = d.itens.reduce((a, i) => a + i.totalCentavos, 0)
  const total =
    '<total><ICMSTot>' +
    tag('vBC', '0.00') +
    tag('vICMS', '0.00') +
    tag('vICMSDeson', '0.00') +
    tag('vFCP', '0.00') +
    tag('vBCST', '0.00') +
    tag('vST', '0.00') +
    tag('vFCPST', '0.00') +
    tag('vFCPSTRet', '0.00') +
    tag('vProd', reais(vProd)) +
    tag('vFrete', '0.00') +
    tag('vSeg', '0.00') +
    tag('vDesc', reais(d.descontoCentavos)) +
    tag('vII', '0.00') +
    tag('vIPI', '0.00') +
    tag('vIPIDevol', '0.00') +
    tag('vPIS', '0.00') +
    tag('vCOFINS', '0.00') +
    tag('vOutro', reais(d.outrosCentavos)) +
    tag('vNF', reais(d.totalCentavos)) +
    '</ICMSTot></total>'

  const transp = '<transp><modFrete>9</modFrete></transp>'

  const p = d.pagamento
  const troco = p.valorCentavos - d.totalCentavos
  const pag =
    '<pag><detPag>' +
    tag('indPag', 0) +
    tag('tPag', p.codigo) +
    (p.codigo === '99' ? tag('xPag', texto(p.descricao ?? 'Outros', 60)) : '') +
    tag('vPag', reais(p.valorCentavos)) +
    // cartão e Pix dinâmico pedem o grupo de pagamento eletrônico;
    // tpIntegra 2 = maquininha/pix não integrado ao sistema
    (['03', '04', '17'].includes(p.codigo) ? '<card><tpIntegra>2</tpIntegra></card>' : '') +
    '</detPag>' +
    (troco > 0 ? tag('vTroco', reais(troco)) : '') +
    '</pag>'

  const infAdic = d.infoComplementar ? `<infAdic>${tag('infCpl', texto(d.infoComplementar, 5000))}</infAdic>` : ''

  const rt = d.respTecnico
  const infRespTec = rt
    ? '<infRespTec>' +
      tag('CNPJ', digitos(rt.cnpj)) +
      tag('xContato', texto(rt.contato, 60)) +
      tag('email', texto(rt.email, 60)) +
      tag('fone', digitos(rt.fone)) +
      '</infRespTec>'
    : ''

  const qrcode = montarQrCode(chave, d.ambiente, d.csc)
  const urlChave = urlConsultaChave(d.ambiente)

  const xml =
    `<NFe xmlns="${NS_NFE}">` +
    `<infNFe versao="4.00" Id="NFe${chave}">` +
    ide +
    emit +
    dest +
    dets +
    total +
    transp +
    pag +
    infAdic +
    infRespTec +
    '</infNFe>' +
    `<infNFeSupl><qrCode><![CDATA[${qrcode}]]></qrCode>${tag('urlChave', urlChave)}</infNFeSupl>` +
    '</NFe>'

  return { chave, xml, qrcode, urlChave }
}
