'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { VALIDADE_MODO_SEGUNDOS } from '@/lib/modo'
import { COOKIE_MODO, type ModoConsumo } from '@/lib/types'

/** Guarda onde a pessoa vai comer. É o que decide o cardápio que ela vê. */
export async function escolherModoAction(modo: ModoConsumo) {
  const armazem = await cookies()
  armazem.set(COOKIE_MODO, modo, {
    maxAge: VALIDADE_MODO_SEGUNDOS,
    sameSite: 'lax',
    path: '/',
  })
  revalidatePath('/', 'layout')
}

export async function limparModoAction() {
  const armazem = await cookies()
  armazem.delete(COOKIE_MODO)
  revalidatePath('/', 'layout')
}
