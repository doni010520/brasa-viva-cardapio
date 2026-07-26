'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { atender } from '@/lib/agente'
import { modeloConfigurado } from '@/lib/agente/modelo'
import { criarClienteAdmin, exigirAdmin, exigirDono } from '@/lib/supabase/server'
import { enviarTexto } from '@/lib/whatsapp'

const esquemaConfig = z.object({
  ativo: z.boolean(),
  nome: z.string().trim().min(2).max(40),
  instrucoes: z.string().trim().max(2000),
})

export async function salvarAgenteAction(entrada: unknown) {
  await exigirDono()

  const analise = esquemaConfig.safeParse(entrada)
  if (!analise.success) return { ok: false as const, erro: 'Confira os campos.' }

  const { ativo, nome, instrucoes } = analise.data

  // Ligar um robô que não tem modelo atrás deixaria o cliente no vácuo:
  // o webhook aceitaria a mensagem e ninguém responderia.
  if (ativo && !modeloConfigurado()) {
    return {
      ok: false as const,
      erro: 'Falta a chave do modelo de IA no servidor (ANTHROPIC_API_KEY ou OPENAI_API_KEY).',
    }
  }

  await criarClienteAdmin()
    .from('configuracoes')
    .update({
      agente_whatsapp_ativo: ativo,
      agente_nome: nome,
      agente_instrucoes: instrucoes || null,
    })
    .eq('id', 1)

  revalidatePath('/admin/whatsapp')
  return { ok: true as const }
}

/**
 * Assume ou devolve a conversa.
 *
 * A regra dura: enquanto um humano estiver com a conversa, a IA não responde
 * — e ela NÃO volta sozinha depois de um tempo. Robô entrando no meio de um
 * atendimento humano é o jeito mais rápido de perder um cliente.
 */
export async function assumirConversaAction(id: string, assumir: boolean) {
  await exigirAdmin()

  await criarClienteAdmin()
    .from('conversas_whatsapp')
    .update({
      humano_assumiu: assumir,
      humano_assumiu_em: assumir ? new Date().toISOString() : null,
    })
    .eq('id', id)

  revalidatePath('/admin/whatsapp')
  return { ok: true as const }
}

/** Mensagem escrita pela equipe, direto da tela do painel. */
export async function responderComoHumanoAction(id: string, texto: string) {
  await exigirAdmin()

  const limpo = texto.trim().slice(0, 1000)
  if (!limpo) return { ok: false as const, erro: 'Escreva alguma coisa.' }

  const supabase = criarClienteAdmin()
  const { data: conversa } = await supabase
    .from('conversas_whatsapp')
    .select('id, telefone, mensagens')
    .eq('id', id)
    .maybeSingle()

  if (!conversa) return { ok: false as const, erro: 'Conversa não encontrada.' }

  const enviado = await enviarTexto(conversa.telefone, limpo)
  if (!enviado) return { ok: false as const, erro: 'O WhatsApp da loja não está conectado.' }

  const mensagens = [
    ...(conversa.mensagens as { papel: string; texto: string }[]),
    { papel: 'agente', texto: limpo },
  ].slice(-24)

  await supabase
    .from('conversas_whatsapp')
    .update({ mensagens, humano_assumiu: true, humano_assumiu_em: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/admin/whatsapp')
  return { ok: true as const }
}

/**
 * Conversa de mentira para o dono experimentar o agente antes de soltar no
 * cliente. Usa o telefone de teste e nunca envia nada pelo WhatsApp.
 */
const TELEFONE_DE_TESTE = '00000000000'

export async function experimentarAgenteAction(texto: string) {
  await exigirDono()

  if (!modeloConfigurado()) {
    return { ok: false as const, erro: 'Falta a chave do modelo de IA no servidor.' }
  }

  const limpo = texto.trim().slice(0, 500)
  if (!limpo) return { ok: false as const, erro: 'Escreva alguma coisa.' }

  try {
    const { respostas } = await atender(TELEFONE_DE_TESTE, limpo)
    return { ok: true as const, respostas }
  } catch (erro) {
    console.error('[agente] falha no teste', erro)
    return { ok: false as const, erro: 'O modelo não respondeu. Confira a chave e tente de novo.' }
  }
}

export async function limparConversaDeTesteAction() {
  await exigirDono()

  await criarClienteAdmin()
    .from('conversas_whatsapp')
    .delete()
    .eq('telefone', TELEFONE_DE_TESTE)

  revalidatePath('/admin/whatsapp')
  return { ok: true as const }
}
