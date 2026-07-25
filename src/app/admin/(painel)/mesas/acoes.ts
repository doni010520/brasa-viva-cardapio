'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { criarClienteAdmin, exigirAdmin } from '@/lib/supabase/server'

type Resposta = { ok: true } | { ok: false; erro: string }

const esquema = z.object({
  id: z.string().uuid().optional(),
  numero: z.string().trim().min(1, 'Informe o número da mesa.').max(20),
  apelido: z.string().trim().max(40).optional(),
  ativa: z.boolean(),
  ordem: z.coerce.number().int().min(0).max(999),
})

export async function salvarMesaAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquema.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data
  const registro = { ...campos, apelido: campos.apelido || null }

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('mesas').update(registro).eq('id', id)
    : await supabase.from('mesas').insert(registro)

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Já existe uma mesa com esse número.' }
    return { ok: false, erro: 'Não consegui salvar a mesa.' }
  }

  revalidatePath('/admin/mesas')
  return { ok: true }
}

export async function excluirMesaAction(id: string): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('mesas').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar a mesa.' }

  revalidatePath('/admin/mesas')
  return { ok: true }
}

/** Cria um bloco de mesas numeradas de uma vez, para não cadastrar uma a uma. */
export async function criarMesasEmLoteAction(quantidade: number): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const total = Math.trunc(quantidade)
  if (!Number.isFinite(total) || total < 1 || total > 100) {
    return { ok: false, erro: 'Informe de 1 a 100 mesas.' }
  }

  const supabase = criarClienteAdmin()
  const { data: existentes } = await supabase.from('mesas').select('numero')
  const jaTem = new Set((existentes ?? []).map((m) => String(m.numero)))

  const novas = []
  for (let n = 1; novas.length < total && n <= 200; n++) {
    if (!jaTem.has(String(n))) novas.push({ numero: String(n), ordem: n })
  }

  if (!novas.length) return { ok: false, erro: 'Essas mesas já existem.' }

  const { error } = await supabase.from('mesas').insert(novas)
  if (error) return { ok: false, erro: 'Não consegui criar as mesas.' }

  revalidatePath('/admin/mesas')
  return { ok: true }
}
