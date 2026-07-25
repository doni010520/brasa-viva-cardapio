'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { criarClienteAdmin, exigirDono } from '@/lib/supabase/server'

type Resposta = { ok: true; aviso?: string } | { ok: false; erro: string }

async function garantirDono(): Promise<string | null> {
  try {
    await exigirDono()
    return null
  } catch {
    return 'Só o dono pode mexer na equipe.'
  }
}

/** Chama a API de administração do Auth do Supabase com a chave de serviço. */
async function authAdmin(caminho: string, opcoes: RequestInit) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const resposta = await fetch(`${base}/auth/v1/admin/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  })

  const texto = await resposta.text()
  let corpo: Record<string, unknown> = {}
  try {
    corpo = JSON.parse(texto)
  } catch {
    // resposta sem corpo
  }
  return { ok: resposta.ok, status: resposta.status, corpo }
}

const esquemaNovo = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da pessoa.').max(60),
  email: z.string().trim().email('E-mail inválido.').max(120),
  senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(72),
  papel: z.enum(['dono', 'atendente']),
})

export async function criarUsuarioAction(entrada: unknown): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const analise = esquemaNovo.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { nome, email, senha, papel } = analise.data

  const criacao = await authAdmin('users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, papel },
    }),
  })

  if (!criacao.ok) {
    const mensagem = String(criacao.corpo?.msg ?? criacao.corpo?.message ?? '')
    if (/already|registered|exists/i.test(mensagem)) {
      return { ok: false, erro: 'Já existe alguém com esse e-mail.' }
    }
    return { ok: false, erro: `Não consegui criar o acesso. ${mensagem}`.trim() }
  }

  // o gatilho do banco já criou a linha em admins; aqui garantimos o papel
  const supabase = criarClienteAdmin()
  await supabase
    .from('admins')
    .update({ papel, nome, email })
    .eq('user_id', criacao.corpo.id as string)

  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function mudarPapelAction(userId: string, papel: 'dono' | 'atendente'): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('admins').update({ papel }).eq('user_id', userId)

  if (error) {
    // o banco protege o último dono; a mensagem dele já é clara
    return { ok: false, erro: error.message.replace(/^.*?:\s*/, '') }
  }

  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function alternarAtivoAction(userId: string, ativo: boolean): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('admins').update({ ativo }).eq('user_id', userId)

  if (error) return { ok: false, erro: error.message.replace(/^.*?:\s*/, '') }

  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function trocarSenhaAction(userId: string, senha: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  if (senha.length < 8) {
    return { ok: false, erro: 'A senha precisa de pelo menos 8 caracteres.' }
  }

  const resposta = await authAdmin(`users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password: senha }),
  })

  if (!resposta.ok) return { ok: false, erro: 'Não consegui trocar a senha.' }

  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function removerUsuarioAction(userId: string): Promise<Resposta> {
  const bloqueio = await garantirDono()
  if (bloqueio) return { ok: false, erro: bloqueio }

  const supabase = criarClienteAdmin()

  // apaga primeiro da equipe: assim o gatilho que protege o último dono
  // barra a operação ANTES de o acesso ser destruído lá no Auth
  const { error } = await supabase.from('admins').delete().eq('user_id', userId)
  if (error) return { ok: false, erro: error.message.replace(/^.*?:\s*/, '') }

  const resposta = await authAdmin(`users/${userId}`, { method: 'DELETE' })
  if (!resposta.ok) {
    return {
      ok: true,
      aviso: 'Removido da equipe, mas o acesso no Supabase precisa ser apagado à mão.',
    }
  }

  revalidatePath('/admin/usuarios')
  return { ok: true }
}
