import { ListaCarrinho } from '@/components/loja/lista-carrinho'
import { buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { estadoDaLoja } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function PaginaCarrinho() {
  const [config, horarios] = await Promise.all([buscarConfiguracoes(), buscarHorarios()])
  const loja = estadoDaLoja(config, horarios)

  return (
    <ListaCarrinho
      pedidoMinimoCentavos={config.pedido_minimo_centavos}
      lojaAberta={loja.aberta}
      motivoFechada={loja.motivo}
    />
  )
}
