import { redirect } from 'next/navigation'
import { FormularioEntrada } from '@/components/loja/formulario-entrada'
import { clienteAtual } from '@/lib/cliente-sessao'
import { buscarConfiguracoes } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Entrar' }

export default async function PaginaEntrar() {
  // quem já entrou não precisa ver tela de login de novo
  if (await clienteAtual()) redirect('/meus-pedidos')

  const config = await buscarConfiguracoes()
  return <FormularioEntrada nomeLoja={config.nome} />
}
