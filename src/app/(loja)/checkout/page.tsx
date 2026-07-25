import Link from 'next/link'
import { FormularioCheckout } from '@/components/loja/formulario-checkout'
import { Botao, Vazio } from '@/components/ui'
import { buscarBairros, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { mercadoPagoConfigurado } from '@/lib/mercadopago'
import { estadoDaLoja, horariosDeRetirada } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function PaginaCheckout() {
  const [config, horarios, bairros] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    buscarBairros(),
  ])
  const loja = estadoDaLoja(config, horarios)

  if (!loja.aberta) {
    return (
      <div className="py-10">
        <Vazio titulo="A loja está fechada" descricao={loja.motivo}>
          <Link href="/">
            <Botao variante="fantasma">Voltar ao cardápio</Botao>
          </Link>
        </Vazio>
      </div>
    )
  }

  return (
    <FormularioCheckout
      pedidoMinimoCentavos={config.pedido_minimo_centavos}
      aceitaOnline={config.aceita_pagamento_online && mercadoPagoConfigurado()}
      aceitaLocal={config.aceita_pagamento_local}
      aceitaRetirada={config.aceita_retirada}
      aceitaEntrega={config.aceita_entrega && bairros.length > 0}
      bairros={bairros}
      tempoPreparoMin={config.tempo_preparo_min}
      tempoEntregaMin={config.tempo_entrega_min}
      entregaGratisAcimaCentavos={config.entrega_gratis_acima_centavos}
      horariosRetirada={horariosDeRetirada(config, horarios)}
    />
  )
}
