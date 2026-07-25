/** Centavos -> "R$ 38,90" */
export function moeda(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** "38,90" ou "38.90" -> 3890 */
export function paraCentavos(texto: string | number): number {
  if (typeof texto === 'number') return Math.round(texto * 100)
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const numero = Number.parseFloat(limpo)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}

/** 3890 -> "38,90" (para preencher inputs) */
export function centavosParaInput(centavos: number | null | undefined) {
  if (centavos === null || centavos === undefined) return ''
  return (centavos / 100).toFixed(2).replace('.', ',')
}

/** Formata telefone brasileiro enquanto o cliente digita. */
export function mascaraTelefone(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

/** Link de WhatsApp com o DDI 55 na frente. */
export function linkWhatsapp(telefone: string, mensagem: string) {
  const numero = apenasDigitos(telefone)
  const comDdi = numero.startsWith('55') ? numero : `55${numero}`
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`
}
