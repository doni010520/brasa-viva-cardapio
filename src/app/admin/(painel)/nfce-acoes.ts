'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { emitirNfce, cancelarNfce } from '@/lib/nfce/emitir'
import { FORMAS_PAGAMENTO, type CodigoPagamento } from '@/lib/nfce/xml'
import { criarClienteAdmin, exigirAdmin, exigirDono } from '@/lib/supabase/server'

type Resposta = { ok: true; mensagem?: string } | { ok: false; erro: string }

const esquemaEmissao = z.object({
  pedidoId: z.string().uuid(),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || cpfValido(v), 'CPF inválido.')
    .optional(),
  pagamento: z.enum(Object.keys(FORMAS_PAGAMENTO) as [CodigoPagamento, ...CodigoPagamento[]]).optional(),
  valorPagoCentavos: z.number().int().nonnegative().optional(),
})

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const dv = (base: string, pesoInicial: number) => {
    const soma = [...base].reduce((a, d, i) => a + Number(d) * (pesoInicial - i), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10])
}

export async function emitirNfceAction(entrada: z.input<typeof esquemaEmissao>): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }

  const analise = esquemaEmissao.safeParse(entrada)
  if (!analise.success) return { ok: false, erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { pedidoId, cpf, pagamento, valorPagoCentavos } = analise.data

  const resultado = await emitirNfce(pedidoId, { cpf: cpf || null, pagamento: pagamento ?? null, valorPagoCentavos })
  revalidatePath('/admin')
  if (!resultado.ok) return { ok: false, erro: resultado.erro }
  return { ok: true, mensagem: `NFC-e nº ${resultado.nota.numero} autorizada. O DANFE foi para a impressora.` }
}

export async function reimprimirNfceAction(pedidoId: string): Promise<Resposta> {
  try {
    await exigirAdmin()
  } catch {
    return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  }
  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('impressoes').insert({ pedido_id: pedidoId, via: 'nfce' })
  if (error) return { ok: false, erro: 'Não consegui mandar o DANFE para a impressora.' }
  return { ok: true }
}

/** Cancelar nota é ato fiscal: só o dono. */
export async function cancelarNfceAction(notaId: string, justificativa: string): Promise<Resposta> {
  try {
    await exigirDono()
  } catch {
    return { ok: false, erro: 'Só o dono pode cancelar nota fiscal.' }
  }
  if (!z.string().uuid().safeParse(notaId).success) return { ok: false, erro: 'Nota inválida.' }

  const resultado = await cancelarNfce(notaId, justificativa)
  revalidatePath('/admin')
  if (!resultado.ok) return { ok: false, erro: resultado.erro }
  return { ok: true, mensagem: `NFC-e nº ${resultado.nota.numero} cancelada na SEFAZ.` }
}
