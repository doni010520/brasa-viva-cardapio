import { criarClienteAdmin } from '@/lib/supabase/server'
import { apenasDigitos } from '@/lib/format'

/**
 * Estado da conversa de WhatsApp.
 *
 * O carrinho mora aqui, em coluna do banco — nunca na transcrição. Se
 * dependesse do modelo lembrar o que foi pedido, um resumo mal feito viraria
 * pedido errado na cozinha.
 */

export type ItemDoCarrinho = {
  produtoId: string
  quantidade: number
  opcaoIds: string[]
  observacao?: string
}

export type Conversa = {
  id: string
  telefone: string
  nome: string | null
  mensagens: { papel: 'cliente' | 'agente'; texto: string }[]
  carrinho: ItemDoCarrinho[]
  tipo_entrega: 'retirada' | 'entrega' | null
  bairro_id: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_referencia: string | null
  humano_assumiu: boolean
  ultimo_pedido_id: string | null
  ultima_mensagem_id: string | null
}

/** Só dígitos e sem o 55 do DDI, igual ao resto do sistema. */
export function normalizarTelefone(bruto: string) {
  const digitos = apenasDigitos(bruto).replace(/^55/, '')
  return digitos.length === 10 || digitos.length === 11 ? digitos : null
}

export async function abrirConversa(telefone: string): Promise<Conversa> {
  const supabase = criarClienteAdmin()

  const { data } = await supabase
    .from('conversas_whatsapp')
    .select('*')
    .eq('telefone', telefone)
    .maybeSingle()

  if (data) return data as Conversa

  const { data: nova, error } = await supabase
    .from('conversas_whatsapp')
    .insert({ telefone })
    .select('*')
    .single()

  if (error || !nova) throw new Error('não consegui abrir a conversa')

  // Cliente que já comprou pelo site não precisa dizer o nome de novo.
  const { data: cliente } = await supabase
    .from('clientes')
    .select('nome')
    .eq('telefone', telefone)
    .maybeSingle()

  if (cliente?.nome) {
    await supabase.from('conversas_whatsapp').update({ nome: cliente.nome }).eq('id', nova.id)
    return { ...(nova as Conversa), nome: cliente.nome }
  }

  return nova as Conversa
}

export async function salvarConversa(id: string, mudancas: Partial<Conversa>) {
  await criarClienteAdmin().from('conversas_whatsapp').update(mudancas).eq('id', id)
}

/** Guarda a transcrição, cortada: conversa de almoço não precisa de memória longa. */
const LIMITE_DE_TURNOS = 24

export function anexarMensagem(
  conversa: Conversa,
  papel: 'cliente' | 'agente',
  texto: string
): Conversa['mensagens'] {
  return [...conversa.mensagens, { papel, texto }].slice(-LIMITE_DE_TURNOS)
}
