import { criarClienteAdmin } from './supabase/server'
import type { Cupom } from './types'
import { hojeIso } from './tempo'

export type ResultadoCupom =
  | { ok: true; cupom: Cupom; descontoCentavos: number }
  | { ok: false; erro: string }

/**
 * Valida o cupom contra o subtotal informado e devolve o desconto em centavos.
 * O desconto nunca passa do subtotal (pedido não fica negativo).
 */
export async function validarCupom(
  codigo: string,
  subtotalCentavos: number
): Promise<ResultadoCupom> {
  const limpo = codigo.trim().toUpperCase()
  if (!limpo) return { ok: false, erro: 'Informe um cupom.' }

  const supabase = criarClienteAdmin()
  const { data } = await supabase.from('cupons').select('*').eq('codigo', limpo).maybeSingle()

  if (!data) return { ok: false, erro: 'Cupom não encontrado.' }
  const cupom = data as Cupom

  if (!cupom.ativo) return { ok: false, erro: 'Este cupom não está mais ativo.' }
  if (cupom.validade && cupom.validade < hojeIso()) {
    return { ok: false, erro: 'Este cupom venceu.' }
  }
  if (cupom.usos_maximos !== null && cupom.usos >= cupom.usos_maximos) {
    return { ok: false, erro: 'Este cupom atingiu o limite de usos.' }
  }
  if (subtotalCentavos < cupom.minimo_centavos) {
    const falta = (cupom.minimo_centavos / 100).toFixed(2).replace('.', ',')
    return { ok: false, erro: `Válido em pedidos a partir de R$ ${falta}.` }
  }

  const bruto =
    cupom.tipo === 'percentual'
      ? Math.floor((subtotalCentavos * cupom.valor) / 100)
      : cupom.valor

  return { ok: true, cupom, descontoCentavos: Math.min(bruto, subtotalCentavos) }
}

/** Conta o uso do cupom. Chamado só quando o pedido de fato se confirma. */
export async function consumirCupom(codigo: string | null) {
  if (!codigo) return
  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('cupons')
    .select('id, usos')
    .eq('codigo', codigo)
    .maybeSingle()
  if (!data) return
  await supabase
    .from('cupons')
    .update({ usos: (data.usos as number) + 1 })
    .eq('id', data.id)
}
