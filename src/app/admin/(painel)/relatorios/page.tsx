import { Cartao, Selo, Vazio } from '@/components/ui'
import { moeda } from '@/lib/format'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { inicioDoDiaAtras, partesNoFuso } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

const DIAS_ANALISADOS = 30

type LinhaPedido = {
  total_centavos: number
  criado_em: string
  forma_pagamento: string
  status: string
}

type LinhaItem = {
  produto_nome: string
  quantidade: number
  total_centavos: number
}

export default async function PaginaRelatorios() {
  const supabase = criarClienteAdmin()
  const desde = inicioDoDiaAtras(DIAS_ANALISADOS - 1).toISOString()

  const [{ data: pedidosBrutos }, { data: itensBrutos }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('total_centavos, criado_em, forma_pagamento, status')
      .gte('criado_em', desde)
      .not('status', 'in', '(cancelado,aguardando_pagamento)'),
    supabase
      .from('pedido_itens')
      .select('produto_nome, quantidade, total_centavos, pedidos!inner(criado_em, status)')
      .gte('pedidos.criado_em', desde)
      .not('pedidos.status', 'in', '(cancelado,aguardando_pagamento)'),
  ])

  const pedidos = (pedidosBrutos ?? []) as LinhaPedido[]
  const itens = (itensBrutos ?? []) as unknown as LinhaItem[]

  const faturamento = pedidos.reduce((s, p) => s + p.total_centavos, 0)
  const ticketMedio = pedidos.length ? Math.round(faturamento / pedidos.length) : 0
  const online = pedidos.filter((p) => p.forma_pagamento === 'online').length

  // --- vendas por dia ---
  const porDia = new Map<string, { pedidos: number; total: number }>()
  for (let i = DIAS_ANALISADOS - 1; i >= 0; i--) {
    const p = partesNoFuso(new Date(Date.now() - i * 86400000))
    porDia.set(`${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}`, {
      pedidos: 0,
      total: 0,
    })
  }
  for (const pedido of pedidos) {
    const p = partesNoFuso(new Date(pedido.criado_em))
    const chave = `${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}`
    const atual = porDia.get(chave)
    if (atual) {
      atual.pedidos += 1
      atual.total += pedido.total_centavos
    }
  }
  const dias = [...porDia.entries()]
  const maiorDia = Math.max(1, ...dias.map(([, d]) => d.total))

  // --- ranking de produtos ---
  const porProduto = new Map<string, { quantidade: number; total: number }>()
  for (const item of itens) {
    const atual = porProduto.get(item.produto_nome) ?? { quantidade: 0, total: 0 }
    atual.quantidade += item.quantidade
    atual.total += item.total_centavos
    porProduto.set(item.produto_nome, atual)
  }
  const ranking = [...porProduto.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
  const maiorProduto = Math.max(1, ...ranking.map(([, p]) => p.total))

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Relatórios</h1>
        <p className="text-sm text-tinta-500">
          Últimos {DIAS_ANALISADOS} dias. Pedidos cancelados e não pagos ficam de fora.
        </p>
      </div>

      {pedidos.length === 0 ? (
        <Vazio
          titulo="Ainda não há vendas no período"
          descricao="Assim que os pedidos começarem a entrar, os números aparecem aqui."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Faturamento" valor={moeda(faturamento)} />
            <Indicador rotulo="Pedidos" valor={String(pedidos.length)} />
            <Indicador rotulo="Ticket médio" valor={moeda(ticketMedio)} />
            <Indicador
              rotulo="Pagos online"
              valor={`${Math.round((online / pedidos.length) * 100)}%`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Vendas por dia</h2>
              <div className="space-y-1">
                {dias.map(([dia, dados]) => (
                  <div key={dia} className="flex items-center gap-2">
                    <span className="w-11 shrink-0 text-xs text-tinta-400 tabular-nums">
                      {dia}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-tinta-100">
                      <div
                        className="bg-marca h-full rounded transition-all"
                        style={{ width: `${Math.max(2, (dados.total / maiorDia) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-medium text-tinta-600 tabular-nums">
                      {dados.total > 0 ? moeda(dados.total) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </Cartao>

            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Produtos que mais vendem</h2>
              {ranking.length === 0 ? (
                <p className="text-sm text-tinta-400">Sem dados de itens no período.</p>
              ) : (
                <ol className="space-y-2.5">
                  {ranking.map(([nome, dados], indice) => (
                    <li key={nome}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-tinta-900">
                          <span className="mr-1.5 text-tinta-400 tabular-nums">
                            {indice + 1}.
                          </span>
                          {nome}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-tinta-700 tabular-nums">
                          {moeda(dados.total)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tinta-100">
                          <div
                            className="bg-marca h-full rounded-full"
                            style={{ width: `${(dados.total / maiorProduto) * 100}%` }}
                          />
                        </div>
                        <Selo tom="neutro">{dados.quantidade} un.</Selo>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Cartao>
          </div>
        </>
      )}
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
