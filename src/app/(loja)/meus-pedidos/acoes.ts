'use server'

import { z } from 'zod'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Pedido } from '@/lib/types'

/**
 * Busca os pedidos que ESTE navegador guardou.
 *
 * Não existe conta nem senha: a identidade é o próprio link do pedido, cujo
 * id é impossível de adivinhar. A ação aceita só os ids que o navegador já
 * tinha guardado na hora da compra.
 *
 * Ela nunca aceita telefone como chave de busca, e isso é a trava principal:
 * quem soubesse o número de alguém veria o nome, o endereço e o histórico de
 * compras daquela pessoa. Buscar por telefone só seria seguro com uma prova
 * de que o número é de quem está pedindo — e é justamente essa burocracia que
 * o sistema não quer ter.
 */
const esquema = z.array(z.string().uuid()).max(20)

export async function buscarMeusPedidosAction(ids: unknown): Promise<Pedido[]> {
  const analise = esquema.safeParse(ids)
  if (!analise.success || analise.data.length === 0) return []

  const { data } = await criarClienteAdmin()
    .from('pedidos')
    .select('*, itens:pedido_itens(*)')
    .in('id', analise.data)
    .order('criado_em', { ascending: false })

  return (data ?? []) as Pedido[]
}
