import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { COOKIE_MESA, COOKIE_MODO, VALIDADE_MODO_SEGUNDOS } from '@/lib/modo'

/**
 * Destino do QR Code colado na mesa.
 *
 * Abre o site já no modo "estou no restaurante" e com a mesa preenchida,
 * para o cliente pedir sentado sem escolher nada. Se o QR for de uma mesa
 * que não existe mais, cai no fluxo normal em vez de dar erro na cara dele.
 */
export async function GET(
  _request: NextRequest,
  contexto: { params: Promise<{ numero: string }> }
) {
  const { numero } = await contexto.params
  const procurado = decodeURIComponent(numero).trim()

  const supabase = criarClienteAdmin()
  const { data: mesa } = await supabase
    .from('mesas')
    .select('id, numero, ativa')
    .ilike('numero', procurado)
    .maybeSingle()

  const armazem = await cookies()
  const opcoes = { maxAge: VALIDADE_MODO_SEGUNDOS, sameSite: 'lax' as const, path: '/' }

  if (mesa?.ativa) {
    armazem.set(COOKIE_MODO, 'local', opcoes)
    armazem.set(COOKIE_MESA, mesa.numero, opcoes)
  } else {
    // QR antigo ou mesa desativada: some com a mesa, deixa a pessoa escolher
    armazem.delete(COOKIE_MESA)
  }

  return NextResponse.redirect(new URL('/', _request.url))
}
