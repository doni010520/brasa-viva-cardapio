import { ListaMeusPedidos } from '@/components/loja/lista-meus-pedidos'
import { clienteAtual } from '@/lib/cliente-sessao'
import { buscarConfiguracoes } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Meus pedidos' }

export default async function PaginaMeusPedidos() {
  const [config, sessao] = await Promise.all([buscarConfiguracoes(), clienteAtual()])

  return (
    <ListaMeusPedidos
      whatsappLoja={config.whatsapp}
      telefoneLoja={config.telefone}
      nomeLoja={config.nome}
      sessao={sessao}
    />
  )
}
