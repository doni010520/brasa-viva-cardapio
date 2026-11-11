import { randomInt } from 'node:crypto'

/**
 * Chave de acesso de 44 dígitos:
 * cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) cNF(8) DV(1)
 */

/** Dígito verificador módulo 11, pesos 2..9 da direita pra esquerda. */
export function digitoVerificador(base43: string) {
  let soma = 0
  let peso = 2
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** Código numérico aleatório; a regra proíbe que seja igual ao número da nota. */
export function codigoNumerico(numero: number) {
  let cnf: string
  do {
    cnf = String(randomInt(0, 100_000_000)).padStart(8, '0')
  } while (Number(cnf) === numero)
  return cnf
}

export function montarChave(dados: {
  cUF: string
  emissao: Date // usado só ano/mês, no fuso da Bahia
  cnpj: string
  modelo: number
  serie: number
  numero: number
  tpEmis: number
  cNF: string
}) {
  const aamm = anoMesBahia(dados.emissao)
  const base =
    dados.cUF.padStart(2, '0') +
    aamm +
    dados.cnpj.replace(/\D/g, '').padStart(14, '0') +
    String(dados.modelo).padStart(2, '0') +
    String(dados.serie).padStart(3, '0') +
    String(dados.numero).padStart(9, '0') +
    String(dados.tpEmis) +
    dados.cNF
  if (base.length !== 43) throw new Error(`Chave com tamanho errado (${base.length}).`)
  const dv = digitoVerificador(base)
  return { chave: base + dv, dv }
}

/** A Bahia está em UTC-3 o ano inteiro (sem horário de verão). */
const OFFSET_MS = -3 * 60 * 60 * 1000

function partesBahia(data: Date) {
  const d = new Date(data.getTime() + OFFSET_MS)
  const p = (n: number, t = 2) => String(n).padStart(t, '0')
  return {
    ano: p(d.getUTCFullYear(), 4),
    mes: p(d.getUTCMonth() + 1),
    dia: p(d.getUTCDate()),
    hora: p(d.getUTCHours()),
    min: p(d.getUTCMinutes()),
    seg: p(d.getUTCSeconds()),
  }
}

function anoMesBahia(data: Date) {
  const p = partesBahia(data)
  return p.ano.slice(2) + p.mes
}

/** Formato exigido pela SEFAZ: 2026-11-11T14:05:00-03:00 */
export function dataHoraSefaz(data: Date) {
  const p = partesBahia(data)
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.min}:${p.seg}-03:00`
}

/** Chave em blocos de 4, como sai no DANFE. */
export function chaveFormatada(chave: string) {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ')
}
