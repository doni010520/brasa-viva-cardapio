'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { criarClienteAdmin, exigirAdmin } from '@/lib/supabase/server'

type Resposta = { ok: true } | { ok: false; erro: string }

const esquemaConfig = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à loja.').max(60),
  descricao: z.string().trim().max(200).optional(),
  logo_url: z.string().trim().max(500).optional(),
  cor_primaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida. Use o formato #RRGGBB.'),
  telefone: z.string().trim().max(20).optional(),
  whatsapp: z.string().trim().max(20).optional(),
  endereco: z.string().trim().max(200).optional(),
  tempo_preparo_min: z.coerce.number().int().min(0).max(480),
  antecedencia_min: z.coerce.number().int().min(0).max(480),
  pedido_minimo_centavos: z.coerce.number().int().min(0).max(100_000_00),
  aceita_pagamento_online: z.boolean(),
  aceita_pagamento_local: z.boolean(),
  chave_pix: z.string().trim().max(120).optional(),
  aceita_pix: z.boolean(),
  aceita_cartao: z.boolean(),
  pix_expira_min: z.coerce.number().int().min(5).max(1440),
  aceita_retirada: z.boolean(),
  aceita_entrega: z.boolean(),
  tempo_entrega_min: z.coerce.number().int().min(0).max(480),
  entrega_gratis_acima_centavos: z.coerce.number().int().min(0).max(100_000_00).nullable(),
})

export async function salvarConfiguracoesAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquemaConfig.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const dados = analise.data

  if (!dados.aceita_pagamento_online && !dados.aceita_pagamento_local) {
    return { ok: false, erro: 'Deixe pelo menos uma forma de pagamento ligada.' }
  }
  if (!dados.aceita_retirada && !dados.aceita_entrega) {
    return { ok: false, erro: 'Deixe pelo menos retirada ou entrega ligada.' }
  }
  if (dados.aceita_pagamento_online && !dados.aceita_pix && !dados.aceita_cartao) {
    return {
      ok: false,
      erro: 'Com pagamento online ligado, deixe ao menos Pix ou cartão marcado.',
    }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase
    .from('configuracoes')
    .update({
      ...dados,
      descricao: dados.descricao || null,
      logo_url: dados.logo_url || null,
      telefone: dados.telefone || null,
      whatsapp: dados.whatsapp || null,
      endereco: dados.endereco || null,
      chave_pix: dados.chave_pix || null,
      entrega_gratis_acima_centavos: dados.entrega_gratis_acima_centavos || null,
    })
    .eq('id', 1)

  if (error) return { ok: false, erro: 'Não consegui salvar as configurações.' }

  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

// ------------------------------------------------------- bairros de entrega

const esquemaBairro = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2, 'Informe o nome do bairro.').max(60),
  taxa_centavos: z.coerce.number().int().min(0).max(100_00),
  tempo_min: z.coerce.number().int().min(0).max(480),
  ativo: z.boolean(),
  ordem: z.coerce.number().int().min(0).max(999),
})

export async function salvarBairroAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquemaBairro.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = analise.data

  const supabase = criarClienteAdmin()
  const { error } = id
    ? await supabase.from('bairros_entrega').update(campos).eq('id', id)
    : await supabase.from('bairros_entrega').insert(campos)

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Esse bairro já está cadastrado.' }
    return { ok: false, erro: 'Não consegui salvar o bairro.' }
  }

  revalidatePath('/admin/config')
  revalidatePath('/checkout')
  return { ok: true }
}

export async function excluirBairroAction(id: string): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('bairros_entrega').delete().eq('id', id)
  if (error) return { ok: false, erro: 'Não consegui apagar o bairro.' }

  revalidatePath('/admin/config')
  revalidatePath('/checkout')
  return { ok: true }
}

const esquemaHorarios = z.array(
  z.object({
    dia_semana: z.coerce.number().int().min(0).max(6),
    fechado: z.boolean(),
    abre: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
    fecha: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  })
)

export async function salvarHorariosAction(entrada: unknown): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquemaHorarios.safeParse(entrada)
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0]?.message ?? 'Horários inválidos.' }
  }

  const supabase = criarClienteAdmin()
  const { error } = await supabase
    .from('horarios')
    .upsert(analise.data, { onConflict: 'dia_semana' })

  if (error) return { ok: false, erro: 'Não consegui salvar os horários.' }

  revalidatePath('/', 'layout')
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
