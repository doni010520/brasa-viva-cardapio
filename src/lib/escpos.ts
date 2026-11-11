import { moeda } from './format'
import { dataHoraCurta, horaCurta } from './tempo'
import { extraDaOpcao, rotuloOpcao } from './types'
import type { Pedido } from './types'

/**
 * Monta a comanda em ESC/POS — a linguagem que praticamente toda impressora
 * térmica de cupom entende.
 *
 * Decisão importante: os acentos são transliterados para ASCII. Cada
 * impressora tem sua tabela de caracteres (CP850, CP860, CP1252...) e
 * mandar acento sem saber o modelo produz lixo no papel ("PICANHA" virando
 * "PICANH@"). ASCII sai certo em todas. Quando o modelo for conhecido, dá
 * para trocar por CP860 e ganhar os acentos de volta.
 */

const LARGURA = 48 // colunas de uma bobina de 80mm em fonte normal

// --- comandos ---
const ESC = 0x1b
const GS = 0x1d
const INICIALIZA = [ESC, 0x40]
const ALINHA_ESQ = [ESC, 0x61, 0]
const ALINHA_CENTRO = [ESC, 0x61, 1]
const NEGRITO_ON = [ESC, 0x45, 1]
const NEGRITO_OFF = [ESC, 0x45, 0]
const TAMANHO_NORMAL = [GS, 0x21, 0x00]
const TAMANHO_DOBRO = [GS, 0x21, 0x11] // dobro de largura e altura
const TAMANHO_ALTO = [GS, 0x21, 0x01]
const CORTAR = [GS, 0x56, 0x42, 0x00] // corte parcial, com avanço

/**
 * Espaços "invisíveis" que precisam virar espaço comum.
 *
 * O formatador de moeda do pt-BR separa "R$" do número com um espaço
 * não-quebrável (U+00A0). Sem tratar isso, o cupom sai com "R$?98,00" —
 * o defeito só aparece no papel, nunca na tela.
 */
const ESPACOS = /[     ]/g

/** Pontuação tipográfica que não existe em ASCII. */
const PONTUACAO: Record<string, string> = {
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
  '–': '-', '—': '-', '−': '-', '…': '...', '•': '*', '·': '-',
  '₂': '2', '½': '1/2', '¼': '1/4', 'º': 'o', 'ª': 'a', '°': 'o',
}

function semAcento(texto: string) {
  return (
    texto
      .replace(ESPACOS, ' ')
      .replace(/[“”„‘’–—−…•·₂½¼ºª°]/g, (c) => PONTUACAO[c] ?? c)
      // separa a letra do acento e joga o acento fora: pega todos os casos
      // do português sem precisar de um mapa letra a letra
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // o que sobrou fora do ASCII não tem como ser impresso: some
      .replace(/[^\x20-\x7e\n]/g, '')
  )
}

class Fita {
  private partes: number[] = []

  cmd(bytes: number[]) {
    this.partes.push(...bytes)
    return this
  }

  texto(valor: string) {
    const limpo = semAcento(valor)
    for (let i = 0; i < limpo.length; i++) this.partes.push(limpo.charCodeAt(i) & 0xff)
    return this
  }

  linha(valor = '') {
    return this.texto(valor).cmd([0x0a])
  }

  /** Rótulo à esquerda, valor à direita, pontilhado no meio. */
  linhaDupla(esquerda: string, direita: string, largura = LARGURA) {
    const e = semAcento(esquerda)
    const d = semAcento(direita)
    const espaco = Math.max(1, largura - e.length - d.length)
    return this.linha(`${e}${' '.repeat(espaco)}${d}`)
  }

  divisor(caractere = '-') {
    return this.linha(caractere.repeat(LARGURA))
  }

  /** Quebra o texto em várias linhas respeitando a largura do papel. */
  paragrafo(valor: string, recuo = 0) {
    const palavras = semAcento(valor).split(/\s+/)
    const largura = LARGURA - recuo
    let atual = ''
    for (const palavra of palavras) {
      if ((atual + ' ' + palavra).trim().length > largura) {
        this.linha(' '.repeat(recuo) + atual.trim())
        atual = palavra
      } else {
        atual = `${atual} ${palavra}`
      }
    }
    if (atual.trim()) this.linha(' '.repeat(recuo) + atual.trim())
    return this
  }

  /**
   * QR Code nativo da impressora (GS ( k, modelo 2). Toda térmica
   * Epson-compatível de 80mm entende; a i7 Plus inclusive.
   */
  qrcode(conteudo: string, modulo = 5) {
    const dados = Array.from(Buffer.from(conteudo, 'ascii'))
    const tamanho = dados.length + 3
    return this.cmd([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]) // modelo 2
      .cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, modulo]) // tamanho do ponto
      .cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]) // correção de erro M
      .cmd([GS, 0x28, 0x6b, tamanho & 0xff, tamanho >> 8, 0x31, 0x50, 0x30, ...dados]) // guarda
      .cmd([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]) // imprime
  }

  bytes() {
    return Uint8Array.from(this.partes)
  }
}

/** Comanda da cozinha. Grande onde importa: número, mesa e observações. */
export function comandaEscpos(
  pedido: Pedido,
  nomeLoja: string,
  cnpj?: string | null
): Uint8Array {
  const f = new Fita()
  const codigo = String(pedido.numero).padStart(3, '0')
  const ondeVai =
    pedido.tipo_entrega === 'entrega'
      ? 'ENTREGA'
      : pedido.tipo_entrega === 'local'
        ? 'SALAO'
        : 'RETIRADA'

  f.cmd(INICIALIZA).cmd(ALINHA_CENTRO)

  f.cmd(NEGRITO_ON).linha(nomeLoja.toUpperCase()).cmd(NEGRITO_OFF)
  if (cnpj) f.linha(`CNPJ ${cnpj}`)
  f.linha(dataHoraCurta(pedido.criado_em))
  f.linha('*** CUPOM NAO FISCAL ***')
  f.divisor('=')

  // o número e o destino são o que o cozinheiro procura de longe
  f.cmd(TAMANHO_DOBRO).cmd(NEGRITO_ON).linha(`#${codigo}`).cmd(TAMANHO_NORMAL)
  f.cmd(TAMANHO_ALTO).linha(pedido.origem === 'balcao' ? 'BALCAO' : ondeVai)
  if (pedido.mesa_numero) f.linha(`MESA ${pedido.mesa_numero}`)
  f.cmd(TAMANHO_NORMAL).cmd(NEGRITO_OFF)

  f.divisor('=')
  f.cmd(ALINHA_ESQ)

  f.linha(`Cliente: ${pedido.cliente_nome}`)
  // lançamento do balcão não tem telefone de verdade
  if (pedido.origem !== 'balcao') f.linha(`Fone...: ${pedido.cliente_telefone}`)
  if (pedido.retirada_prevista) {
    f.linha(`${pedido.tipo_entrega === 'entrega' ? 'Previsto' : 'Retirada'}: ${horaCurta(pedido.retirada_prevista)}`)
  }

  if (pedido.tipo_entrega === 'entrega') {
    f.divisor()
    f.cmd(NEGRITO_ON).linha('ENDERECO').cmd(NEGRITO_OFF)
    f.paragrafo(
      `${pedido.endereco_rua}, ${pedido.endereco_numero}${
        pedido.endereco_complemento ? ` - ${pedido.endereco_complemento}` : ''
      }`
    )
    f.linha(pedido.endereco_bairro ?? '')
    if (pedido.endereco_referencia) f.paragrafo(`Ref.: ${pedido.endereco_referencia}`)
  }

  f.divisor()

  for (const item of pedido.itens ?? []) {
    f.cmd(NEGRITO_ON)
      .linhaDupla(`${item.quantidade}x ${semAcento(item.produto_nome)}`, moeda(item.total_centavos))
      .cmd(NEGRITO_OFF)

    for (const opcao of item.opcoes) {
      f.linha(
        `   - ${semAcento(rotuloOpcao(opcao))}${
          opcao.preco_extra_centavos > 0 ? ` (${moeda(extraDaOpcao(opcao))})` : ''
        }`
      )
    }
    if (item.observacao) {
      // observação de item é o que mais gera prato errado: sai em destaque
      f.cmd(NEGRITO_ON).paragrafo(`** ${item.observacao.toUpperCase()}`, 3).cmd(NEGRITO_OFF)
    }
  }

  f.divisor()
  f.linhaDupla('Subtotal', moeda(pedido.subtotal_centavos))
  if (pedido.desconto_centavos > 0) {
    f.linhaDupla(
      `Desconto ${pedido.cupom_codigo ?? ''}`.trim(),
      `-${moeda(pedido.desconto_centavos)}`
    )
  }
  if (pedido.entrega_taxa_centavos > 0) {
    f.linhaDupla('Taxa de entrega', moeda(pedido.entrega_taxa_centavos))
  }
  f.cmd(NEGRITO_ON).linhaDupla('TOTAL', moeda(pedido.total_centavos)).cmd(NEGRITO_OFF)

  f.divisor('=')
  f.cmd(ALINHA_CENTRO).cmd(NEGRITO_ON)
  f.linha(
    pedido.status_pagamento === 'pago'
      ? '*** PAGO ***'
      : pedido.forma_pagamento === 'local'
        ? '*** COBRAR NO BALCAO ***'
        : '*** PAGAMENTO PENDENTE ***'
  )
  f.cmd(NEGRITO_OFF).cmd(ALINHA_ESQ)

  if (pedido.observacoes) {
    f.divisor()
    f.cmd(NEGRITO_ON).linha('OBSERVACAO DO PEDIDO').paragrafo(pedido.observacoes.toUpperCase())
    f.cmd(NEGRITO_OFF)
  }

  f.linha().linha().linha()
  f.cmd(CORTAR)

  return f.bytes()
}

/**
 * Recibo do CLIENTE — o comprovante de consumo que a pessoa anexa no
 * reembolso da empresa ("a notinha do almoço"). Diferente da comanda da
 * cozinha, aqui o que importa é identificar a casa (CNPJ, endereço),
 * detalhar o que foi consumido com valores e dizer como foi pago.
 * É e sempre será NÃO fiscal: o cupom diz isso em duas linhas.
 */
export function reciboEscpos(
  pedido: Pedido,
  loja: { nome: string; cnpj: string | null; endereco: string | null; telefone: string | null }
): Uint8Array {
  const f = new Fita()
  const codigo = String(pedido.numero).padStart(3, '0')

  f.cmd(INICIALIZA).cmd(ALINHA_CENTRO)

  f.cmd(NEGRITO_ON).linha(loja.nome.toUpperCase()).cmd(NEGRITO_OFF)
  if (loja.cnpj) f.linha(`CNPJ ${loja.cnpj}`)
  if (loja.endereco) f.paragrafo(loja.endereco)
  if (loja.telefone) f.linha(`Tel: ${loja.telefone}`)

  f.divisor()
  f.cmd(NEGRITO_ON).cmd(TAMANHO_ALTO).linha('COMPROVANTE DE CONSUMO').cmd(TAMANHO_NORMAL)
  f.linha('*** CUPOM NAO FISCAL ***').cmd(NEGRITO_OFF)
  f.linha('Documento sem valor fiscal')
  f.divisor('=')

  f.cmd(ALINHA_ESQ)
  f.linhaDupla(`Pedido #${codigo}`, dataHoraCurta(pedido.criado_em))
  f.linha(`Cliente: ${pedido.cliente_nome}`)
  f.divisor()

  for (const item of pedido.itens ?? []) {
    f.linhaDupla(`${item.quantidade}x ${semAcento(item.produto_nome)}`, moeda(item.total_centavos))
    for (const opcao of item.opcoes) {
      // no recibo só interessa o que mudou o preço
      if (opcao.preco_extra_centavos > 0) {
        f.linhaDupla(`   + ${semAcento(rotuloOpcao(opcao))}`, moeda(extraDaOpcao(opcao)))
      }
    }
  }

  f.divisor()
  f.linhaDupla('Subtotal', moeda(pedido.subtotal_centavos))
  if (pedido.desconto_centavos > 0) {
    f.linhaDupla('Desconto', `-${moeda(pedido.desconto_centavos)}`)
  }
  if (pedido.entrega_taxa_centavos > 0) {
    f.linhaDupla('Taxa de entrega', moeda(pedido.entrega_taxa_centavos))
  }
  f.cmd(NEGRITO_ON).linhaDupla('TOTAL', moeda(pedido.total_centavos)).cmd(NEGRITO_OFF)

  const metodo =
    pedido.metodo_pagamento === 'pix'
      ? 'Pix'
      : pedido.metodo_pagamento === 'credit_card'
        ? 'Cartao de credito'
        : pedido.forma_pagamento === 'online'
          ? 'Online'
          : 'No balcao'
  f.linhaDupla(
    `Pagamento: ${metodo}`,
    pedido.status_pagamento === 'pago' ? 'PAGO' : 'PENDENTE'
  )

  f.divisor('=')
  f.cmd(ALINHA_CENTRO)
  f.linha('Obrigado pela preferencia!')

  f.linha().linha().linha()
  f.cmd(CORTAR)

  return f.bytes()
}

// ------------------------------------------------------------------ DANFE NFC-e

const FORMAS_DANFE: Record<string, string> = {
  '01': 'Dinheiro',
  '03': 'Cartao de Credito',
  '04': 'Cartao de Debito',
  '17': 'Pix',
  '20': 'Pix',
  '99': 'Outros',
}

function tagXml(xml: string, nome: string) {
  return xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1] ?? ''
}

function desescapa(v: string) {
  return v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

const valorBr = (v: string) => Number(v || 0).toFixed(2).replace('.', ',')

/**
 * DANFE NFC-e (Documento Auxiliar), montado a partir do XML AUTORIZADO —
 * assim o papel nunca diverge do que a SEFAZ recebeu. Segue a ordem de
 * divisões do Manual do DANFE NFC-e: emitente, título, itens, totais,
 * pagamento, consulta pela chave, consumidor, identificação + protocolo,
 * QR Code.
 */
export function danfeNfceEscpos(xml: string): Uint8Array {
  const f = new Fita()
  const emit = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? ''
  const ender = emit.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/)?.[1] ?? ''
  const ide = xml.match(/<ide>([\s\S]*?)<\/ide>/)?.[1] ?? ''
  const tot = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/)?.[1] ?? ''
  const prot = xml.match(/<infProt[^>]*>([\s\S]*?)<\/infProt>/)?.[1] ?? ''
  const chave = xml.match(/Id="NFe(\d{44})"/)?.[1] ?? ''
  const qrcode = xml.match(/<qrCode><!\[CDATA\[([\s\S]*?)\]\]><\/qrCode>/)?.[1] ?? ''
  const urlChave = tagXml(xml, 'urlChave')
  const cpf = xml.match(/<dest>[\s\S]*?<CPF>(\d{11})<\/CPF>/)?.[1]
  const homologacao = tagXml(ide, 'tpAmb') === '2'
  const cnpj = tagXml(emit, 'CNPJ').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

  f.cmd(INICIALIZA).cmd(ALINHA_CENTRO)

  // I — emitente
  f.cmd(NEGRITO_ON).paragrafo(desescapa(tagXml(emit, 'xNome'))).cmd(NEGRITO_OFF)
  f.linha(`CNPJ ${cnpj}  IE ${tagXml(emit, 'IE')}`)
  f.paragrafo(
    desescapa(
      `${tagXml(ender, 'xLgr')}, ${tagXml(ender, 'nro')} - ${tagXml(ender, 'xBairro')} - ${tagXml(ender, 'xMun')}/${tagXml(ender, 'UF')}`
    )
  )
  f.divisor()

  // II — título
  f.cmd(NEGRITO_ON).linha('DANFE NFC-e - Documento Auxiliar da').linha('Nota Fiscal de Consumidor Eletronica').cmd(NEGRITO_OFF)
  if (homologacao) {
    f.cmd(NEGRITO_ON).linha('EMITIDA EM AMBIENTE DE HOMOLOGACAO').linha('- SEM VALOR FISCAL -').cmd(NEGRITO_OFF)
  }
  f.divisor()

  // III — itens
  f.cmd(ALINHA_ESQ)
  f.linha('# DESCRICAO')
  f.linhaDupla('  QTD UN x VL UNIT', 'VL TOTAL')
  const dets = [...xml.matchAll(/<det nItem="(\d+)">([\s\S]*?)<\/det>/g)]
  for (const [, n, det] of dets) {
    f.paragrafo(`${n} ${desescapa(tagXml(det, 'xProd'))}`)
    const qtd = Number(tagXml(det, 'qCom'))
    f.linhaDupla(
      `  ${Number.isInteger(qtd) ? qtd : qtd.toFixed(3).replace('.', ',')} ${tagXml(det, 'uCom')} x ${valorBr(tagXml(det, 'vUnCom'))}`,
      valorBr(tagXml(det, 'vProd'))
    )
  }
  f.divisor()

  // IV — totais
  const vDesc = Number(tagXml(tot, 'vDesc'))
  const vOutro = Number(tagXml(tot, 'vOutro'))
  f.linhaDupla('Qtde. total de itens', String(dets.length))
  f.linhaDupla('Valor total R$', valorBr(tagXml(tot, 'vProd')))
  if (vDesc > 0) f.linhaDupla('Desconto R$', valorBr(String(vDesc)))
  if (vOutro > 0) f.linhaDupla('Acrescimos (entrega) R$', valorBr(String(vOutro)))
  f.cmd(NEGRITO_ON).linhaDupla('Valor a pagar R$', valorBr(tagXml(tot, 'vNF'))).cmd(NEGRITO_OFF)
  f.linhaDupla('FORMA PAGAMENTO', 'VALOR PAGO R$')
  for (const [, pag] of xml.matchAll(/<detPag>([\s\S]*?)<\/detPag>/g)) {
    const codigo = tagXml(pag, 'tPag')
    f.linhaDupla(FORMAS_DANFE[codigo] ?? desescapa(tagXml(pag, 'xPag')) ?? 'Outros', valorBr(tagXml(pag, 'vPag')))
  }
  const troco = tagXml(xml, 'vTroco')
  if (troco) f.linhaDupla('Troco R$', valorBr(troco))
  f.divisor()

  // V — consulta pela chave
  f.cmd(ALINHA_CENTRO)
  f.cmd(NEGRITO_ON).linha('Consulte pela Chave de Acesso em').cmd(NEGRITO_OFF)
  f.paragrafo(urlChave)
  f.linha(chave.replace(/(\d{4})(?=\d)/g, '$1 '))
  f.divisor()

  // VI — consumidor
  f.linha(cpf ? `CONSUMIDOR - CPF ${cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}` : 'CONSUMIDOR NAO IDENTIFICADO')
  f.divisor()

  // VII — identificação e protocolo
  const emissao = tagXml(ide, 'dhEmi')
  const dataBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 19)}` : '')
  f.cmd(NEGRITO_ON).linha(`NFC-e n ${tagXml(ide, 'nNF').padStart(9, '0')}  Serie ${tagXml(ide, 'serie').padStart(3, '0')}`).cmd(NEGRITO_OFF)
  f.linha(dataBr(emissao))
  f.linha(`Protocolo de autorizacao: ${tagXml(prot, 'nProt')}`)
  f.linha(`Data de autorizacao: ${dataBr(tagXml(prot, 'dhRecbto'))}`)
  if (homologacao) f.cmd(NEGRITO_ON).paragrafo('EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL').cmd(NEGRITO_OFF)

  // VIII — QR Code
  if (qrcode) {
    f.linha()
    f.qrcode(qrcode)
    f.linha()
  }

  const info = tagXml(xml, 'infCpl')
  if (info) f.paragrafo(desescapa(info))

  f.linha().linha().linha()
  f.cmd(CORTAR)
  return f.bytes()
}
