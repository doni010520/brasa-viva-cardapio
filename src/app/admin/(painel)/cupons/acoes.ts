'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { criarClienteAdmin, exigirDono } from '@/lib/supabase/server'

type Resposta = { ok: true } | { ok: false; erro: string }

const esquemaCupom = z
  .object({
    id: z.string().uuid().optional(),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, 'O código precisa de pelo menos 3 letras.')
      .max(30)
      .regex(/^[A-Z0-9]+$/, 'Use só letras e números, sem espaço.'),
    tipo: z.enum(['percentual', 'fixo']),
    valor: z.coerce.number().int().min(1, 'Informe o valor do desconto.'),
    minimo_centavos: z.coerce.number().int().min(0).max(100_000_00),
    ativo: z.boolean(),
    validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    usos_maximos: z.coerce.number().int().min(1).nullable().optional(),
  })
  .refine((c) => c.tipo !== 'percentual' || c.valor <= 100, {
    message: 'Desconto em porcentagem não passa de 100.',
    path: ['valor'],
  })

export async function salvarCupomAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirDono()
  } catch {
    return { ok: false, erro: 'Só o dono pode fazer isso. Se a sessão expirou, entre de novo.' }
  }

  const analise = esquemaCupom.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data
  const registro = {
    ...campos,
    validade: campos.validade || null,
    usos_maximos: campos.usos_maximos || null,
  }

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('cupons').update(registro).eq('id', id)
    : await supabase.from('cupons').insert(registro)

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Já existe um cupom com esse código.' }
    return { ok: false, erro: 'Não consegui salvar o cupom.' }
  }

  revalidatePath('/admin/cupons')
  return { ok: true }
}

export async function excluirCupomAction(id: string): Promise<Resposta> {
  try {
    await exigirDono()
  } catch {
    return { ok: false, erro: 'Só o dono pode fazer isso. Se a sessão expirou, entre de novo.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('cupons').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar o cupom.' }

  revalidatePath('/admin/cupons')
  return { ok: true }
}
