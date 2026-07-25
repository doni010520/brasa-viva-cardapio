'use server'

import { redirect } from 'next/navigation'
import { criarClienteServidor } from '@/lib/supabase/server'

export async function entrarAction(
  _estadoAnterior: { erro: string } | null,
  formulario: FormData
): Promise<{ erro: string }> {
  const email = String(formulario.get('email') ?? '').trim()
  const senha = String(formulario.get('senha') ?? '')
  const proximo = String(formulario.get('proximo') ?? '/admin')

  if (!email || !senha) return { erro: 'Preencha e-mail e senha.' }

  const supabase = await criarClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    // não entrega se o e-mail existe ou não
    return { erro: 'E-mail ou senha incorretos.' }
  }

  redirect(proximo.startsWith('/admin') ? proximo : '/admin')
}

export async function sairAction() {
  const supabase = await criarClienteServidor()
  await supabase.auth.signOut()
  redirect('/admin/login')
}
