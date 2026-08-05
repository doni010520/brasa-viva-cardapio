import Link from 'next/link'
import { FormularioCheckout } from '@/components/loja/formulario-checkout'
import { Botao, Vazio } from '@/components/ui'
import { buscarBairros, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { cadastroDoClienteLogado } from '@/lib/cliente-sessao'
import { infinitePayConfigurado } from '@/lib/infinitepay'
import { mercadoPagoConfigurado } from '@/lib/mercadopago'
import { mesaAtual, modoAtual } from '@/lib/modo'
import { estadoDaLoja, horariosDeRetirada } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function PaginaCheckout() {
  const [config, horarios, bairros, modo, mesa, cadastro] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    buscarBairros(),
    modoAtual(),
    mesaAtual(),
    cadastroDoClienteLogado(),
  ])
  const loja = estadoDaLoja(config, horarios)
  const noLocal = modo === 'local' && config.aceita_consumo_local

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
      noLocal={noLocal}
      mesa={noLocal ? mesa : null}
      pedirAniversario={config.pedir_aniversario}
      brindeAniversario={config.brinde_aniversario}
      pedidoMinimoCentavos={config.pedido_minimo_centavos}
      aceitaOnline={
        config.aceita_pagamento_online && (infinitePayConfigurado() || mercadoPagoConfigurado())
      }
      aceitaLocal={config.aceita_pagamento_local}
      aceitaRetirada={config.aceita_retirada}
      aceitaEntrega={config.aceita_entrega && bairros.length > 0}
      bairros={bairros}
      tempoPreparoMin={config.tempo_preparo_min}
      tempoEntregaMin={config.tempo_entrega_min}
      entregaGratisAcimaCentavos={config.entrega_gratis_acima_centavos}
      horariosRetirada={horariosDeRetirada(config, horarios)}
      cadastro={
        cadastro
          ? {
              nome: cadastro.nome,
              telefone: cadastro.telefone,
              email: cadastro.email,
              nascimento: cadastro.data_nascimento,
            }
          : null
      }
    />
  )
}
