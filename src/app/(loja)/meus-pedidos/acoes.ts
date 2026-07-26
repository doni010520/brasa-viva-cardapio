'use server'

import { z } from 'zod'
import { clienteAtual } from '@/lib/cliente-sessao'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Pedido } from '@/lib/types'

const SELECAO = '*, itens:pedido_itens(*)'

/**
 * O histórico do cliente, das duas fontes.
 *
 * Entrou com o WhatsApp? Vem tudo que foi pedido com aquele telefone, de
 * qualquer aparelho — é para isso que o login existe.
 *
 * Não entrou? Vem só o que ESTE navegador guardou na hora da compra. A ação
 * nunca aceita telefone como chave de busca sem sessão: quem soubesse o
 * número de alguém veria o nome, o endereço e o histórico daquela pessoa.
 */
const esquema = z.array(z.string().uuid()).max(20)

export async function buscarMeusPedidosAction(ids: unknown): Promise<Pedido[]> {
  const sessao = await clienteAtual()

  if (sessao?.clienteId) {
    const { data } = await criarClienteAdmin()
      .from('pedidos')
      .select(SELECAO)
      .eq('cliente_id', sessao.clienteId)
      .order('criado_em', { ascending: false })
      .limit(100)

    const daConta = (data ?? []) as Pedido[]

    // Pedidos feitos neste aparelho ANTES de entrar podem ter ido com outro
    // telefone; junta os dois e tira repetido.
    const guardados = await pedidosGuardados(ids)
    const conhecidos = new Set(daConta.map((p) => p.id))

    return [...daConta, ...guardados.filter((p) => !conhecidos.has(p.id))].sort((a, b) =>
      a.criado_em < b.criado_em ? 1 : -1
    )
  }

  return pedidosGuardados(ids)
}

async function pedidosGuardados(ids: unknown): Promise<Pedido[]> {
  const analise = esquema.safeParse(ids)
  if (!analise.success || analise.data.length === 0) return []

  const { data } = await criarClienteAdmin()
    .from('pedidos')
    .select(SELECAO)
    .in('id', analise.data)
    .order('criado_em', { ascending: false })

  return (data ?? []) as Pedido[]
}
