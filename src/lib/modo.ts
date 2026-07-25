import { cookies } from 'next/headers'
import { COOKIE_MODO, type ModoConsumo } from './types'

/**
 * O modo fica em cookie (e não no localStorage) porque o servidor precisa
 * dele para montar o cardápio certo já na primeira renderização — senão o
 * buffet livre pisca na tela de quem pediu entrega.
 */

export async function modoAtual(): Promise<ModoConsumo | null> {
  const valor = (await cookies()).get(COOKIE_MODO)?.value
  return valor === 'local' || valor === 'viagem' ? valor : null
}

/** Dura 4 horas: tempo de uma refeição, sem prender a escolha para sempre. */
export const VALIDADE_MODO_SEGUNDOS = 4 * 60 * 60
