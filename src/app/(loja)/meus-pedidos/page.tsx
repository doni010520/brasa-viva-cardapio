import { ListaMeusPedidos } from '@/components/loja/lista-meus-pedidos'
import { buscarConfiguracoes } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Meus pedidos' }

export default async function PaginaMeusPedidos() {
  const config = await buscarConfiguracoes()

  return (
    <ListaMeusPedidos
      whatsappLoja={config.whatsapp}
      telefoneLoja={config.telefone}
      nomeLoja={config.nome}
    />
  )
}
