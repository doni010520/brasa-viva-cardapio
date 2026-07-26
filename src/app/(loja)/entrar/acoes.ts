'use server'

import { redirect } from 'next/navigation'
import { confirmarCodigo, encerrarSessaoCliente, pedirCodigo } from '@/lib/cliente-sessao'
import { buscarConfiguracoes } from '@/lib/dados'

export type EstadoEntrada = {
  etapa: 'telefone' | 'codigo'
  telefone: string
  erro: string | null
  /** Só chega preenchido no modo demonstração, sem WhatsApp conectado. */
  codigoNaTela: string | null
}

export async function pedirCodigoAction(
  _anterior: EstadoEntrada,
  dados: FormData
): Promise<EstadoEntrada> {
  const telefone = String(dados.get('telefone') ?? '')
  const config = await buscarConfiguracoes()
  const resultado = await pedirCodigo(telefone, config.nome)

  if (!resultado.ok) {
    return { etapa: 'telefone', telefone, erro: resultado.erro, codigoNaTela: null }
  }

  return {
    etapa: 'codigo',
    telefone,
    erro: null,
    codigoNaTela: resultado.canal === 'tela' ? resultado.codigo : null,
  }
}

export async function confirmarCodigoAction(
  anterior: EstadoEntrada,
  dados: FormData
): Promise<EstadoEntrada> {
  // O telefone viaja no próprio formulário: esta ação tem estado próprio e
  // não enxerga o que a etapa anterior guardou.
  const telefone = String(dados.get('telefone') ?? '') || anterior.telefone
  const codigo = String(dados.get('codigo') ?? '')
  const resultado = await confirmarCodigo(telefone, codigo)

  if (!resultado.ok) {
    return { ...anterior, telefone, etapa: 'codigo', erro: resultado.erro }
  }

  redirect('/meus-pedidos')
}

export async function sairAction() {
  await encerrarSessaoCliente()
  redirect('/')
}
