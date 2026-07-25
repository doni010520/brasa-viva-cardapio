import { AtualizacaoAutomatica } from '@/components/loja/atualizacao-automatica'
import { PainelPedidos } from '@/components/admin/painel-pedidos'
import { ChaveDaLoja } from '@/components/admin/chave-da-loja'
import { buscarConfiguracoes, buscarHorarios, buscarPedidosDoPainel } from '@/lib/dados'
import { estadoDaLoja, inicioDoDiaAtras } from '@/lib/tempo'
import { moeda } from '@/lib/format'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { Cartao } from '@/components/ui'

export const dynamic = 'force-dynamic'

async function resumoDeHoje() {
  const supabase = criarClienteAdmin()
  const desde = inicioDoDiaAtras(0).toISOString()

  const { data } = await supabase
    .from('pedidos')
    .select('total_centavos, status')
    .gte('criado_em', desde)
    .neq('status', 'cancelado')
    .neq('status', 'aguardando_pagamento')

  const pedidos = data ?? []
  return {
    quantidade: pedidos.length,
    faturamento: pedidos.reduce((s, p) => s + (p.total_centavos as number), 0),
  }
}

export default async function PaginaPedidos() {
  const [pedidos, config, horarios, hoje] = await Promise.all([
    buscarPedidosDoPainel([
      'aguardando_pagamento',
      'recebido',
      'em_preparo',
      'pronto',
      'saiu_para_entrega',
    ]),
    buscarConfiguracoes(),
    buscarHorarios(),
    resumoDeHoje(),
  ])

  const loja = estadoDaLoja(config, horarios)

  return (
    <>
      <AtualizacaoAutomatica segundos={15} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tinta-900">Pedidos de hoje</h1>
          <p className="text-sm text-tinta-500">
            A tela se atualiza sozinha a cada 15 segundos.
          </p>
        </div>

        <ChaveDaLoja
          abertaManual={config.aberto_manual}
          abertaAgora={loja.aberta}
          motivo={loja.motivo}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Pedidos hoje" valor={String(hoje.quantidade)} />
        <Indicador rotulo="Faturamento hoje" valor={moeda(hoje.faturamento)} />
        <Indicador
          rotulo="Na cozinha"
          valor={String(pedidos.filter((p) => p.status === 'em_preparo').length)}
        />
        <Indicador
          rotulo="Prontos / em rota"
          valor={String(
            pedidos.filter((p) => ['pronto', 'saiu_para_entrega'].includes(p.status)).length
          )}
        />
      </div>

      <PainelPedidos pedidos={pedidos} />
    </>
  )
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Cartao className="p-3.5">
      <p className="text-xs font-medium text-tinta-500">{rotulo}</p>
      <p className="mt-0.5 text-xl font-black text-tinta-900 tabular-nums">{valor}</p>
    </Cartao>
  )
}
