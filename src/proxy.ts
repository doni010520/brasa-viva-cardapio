import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renova a sessão do Supabase a cada requisição e barra o painel para quem não
 * está logado. (No Next.js 16 este arquivo se chama `proxy`, não mais `middleware`.)
 *
 * Isto é a primeira tranca, não a única: cada server action do admin também
 * chama `exigirAdmin()`.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesParaSetar) {
          for (const { name, value } of cookiesParaSetar) {
            request.cookies.set(name, value)
          }
          resposta = NextResponse.next({ request })
          for (const { name, value, options } of cookiesParaSetar) {
            resposta.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const rota = request.nextUrl.pathname
  const ehLogin = rota.startsWith('/admin/login')

  if (!user && rota.startsWith('/admin') && !ehLogin) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/admin/login'
    destino.searchParams.set('proximo', rota)
    return NextResponse.redirect(destino)
  }

  if (user && ehLogin) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/admin'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  return resposta
}

export const config = {
  matcher: ['/admin/:path*'],
}
