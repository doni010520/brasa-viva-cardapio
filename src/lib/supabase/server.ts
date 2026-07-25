import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function env(nome: string) {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`)
  return valor
}

/**
 * Cliente ligado à sessão do usuário (cookies). Use em páginas/actions do admin
 * para saber QUEM está logado. Respeita RLS.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies()

  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesParaSetar) {
          try {
            for (const { name, value, options } of cookiesParaSetar) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Chamado de um Server Component: o proxy já cuida de renovar a sessão.
          }
        },
      },
    }
  )
}

/**
 * Cliente com service role: ignora RLS. NUNCA importe isso em componente
 * de cliente — só em server actions, route handlers e server components.
 */
export function criarClienteAdmin() {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export type Papel = 'dono' | 'atendente'

export type UsuarioPainel = {
  id: string
  email: string
  nome: string
  papel: Papel
  ehDono: boolean
}

/** Retorna o usuário logado do painel, ou null. */
export async function usuarioAdminAtual(): Promise<UsuarioPainel | null> {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = criarClienteAdmin()
  const { data } = await admin
    .from('admins')
    .select('user_id, nome, email, papel, ativo')
    .eq('user_id', user.id)
    .maybeSingle()

  // desligado pelo dono continua com sessão válida no Auth, mas sem acesso
  if (!data || data.ativo === false) return null

  const papel = (data.papel ?? 'atendente') as Papel
  return {
    id: user.id,
    email: user.email ?? '',
    nome: data.nome ?? user.email ?? '',
    papel,
    ehDono: papel === 'dono',
  }
}

/** Usa em toda server action do painel: derruba a chamada se não for da equipe. */
export async function exigirAdmin() {
  const admin = await usuarioAdminAtual()
  if (!admin) throw new Error('Acesso negado. Faça login no painel.')
  return admin
}

/**
 * Para o que mexe em dinheiro, cardápio, cliente ou equipe.
 *
 * O menu já esconde essas telas do atendente, mas esconder botão não é
 * segurança: a ação continua acessível por requisição direta. Esta é a
 * tranca que vale.
 */
export async function exigirDono() {
  const admin = await exigirAdmin()
  if (!admin.ehDono) {
    throw new Error('Só o dono pode fazer isso.')
  }
  return admin
}
