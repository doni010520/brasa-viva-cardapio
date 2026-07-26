'use server'

import { redirect } from 'next/navigation'
import { entrarPeloLink } from '@/lib/cliente-sessao'

export async function entrarPeloLinkAction(dados: FormData) {
  const token = String(dados.get('t') ?? '')
  const entrou = await entrarPeloLink(token)

  // Token queimado no meio do caminho cai na tela de "link vencido", que já
  // oferece o código de 6 dígitos como saída.
  redirect(entrou ? '/meus-pedidos' : '/entrar/link')
}
