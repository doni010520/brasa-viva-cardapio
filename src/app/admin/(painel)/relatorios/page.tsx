import Link from 'next/link'
import { Download, TrendingUp, UserPlus, Users } from 'lucide-react'
import { Cartao, Vazio } from '@/components/ui'
import { moeda } from '@/lib/format'
import {
  buscarRelatorio,
  DIAS_SEMANA,
  ehPeriodo,
  PERIODOS,
  ROTULO_FORMA,
  ROTULO_TIPO,
  type Periodo,
} from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const { periodo: bruto } = await searchParams
  const periodo: Periodo = ehPeriodo(bruto) ? bruto : '30'

  const r = await buscarRelatorio(periodo)
  const { resumo } = r

  const semVendas = resumo.pedidos === 0

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-tinta-900">Relatórios</h1>
          <p className="text-sm text-tinta-500">
            Pedidos cancelados e não pagos ficam de fora das somas.
          </p>
        </div>
        <a href={`/admin/relatorios/csv?periodo=${periodo}`}>
          <span className="inline-flex items-center gap-2 rounded-xl border border-tinta-200 bg-white px-4 py-2.5 text-sm font-semibold text-tinta-700 transition hover:bg-tinta-50">
            <Download className="h-4 w-4" />
            Baixar planilha
          </span>
        </a>
      </div>

      <div className="sem-barra mb-5 flex gap-2 overflow-x-auto pb-1">
        {PERIODOS.map(({ chave, rotulo }) => (
          <Link
            key={chave}
            href={`/admin/relatorios?periodo=${chave}`}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              periodo === chave
                ? 'bg-tinta-900 text-white'
                : 'border border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300'
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {semVendas ? (
        <Vazio
          titulo="Nenhuma venda neste período"
          descricao="Escolha outro período ou espere os pedidos entrarem."
        />
      ) : (
        <>
          {/* ---------------- números do topo ---------------- */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Faturamento" valor={moeda(resumo.faturamento)} destaque />
            <Indicador rotulo="Pedidos" valor={String(resumo.pedidos)} />
            <Indicador rotulo="Ticket médio" valor={moeda(resumo.ticket_medio)} />
            <Indicador rotulo="Itens vendidos" valor={String(resumo.itens)} />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              rotulo="Clientes"
              valor={String(resumo.clientes)}
              rodape={`${r.clientes.novos} novos · ${r.clientes.recorrentes} voltaram`}
            />
            <Indicador
              rotulo="Descontos dados"
              valor={moeda(resumo.descontos)}
              rodape={resumo.descontos > 0 ? `${((resumo.descontos / (resumo.faturamento + resumo.descontos)) * 100).toFixed(1)}% do bruto` : undefined}
            />
            <Indicador rotulo="Taxas de entrega" valor={moeda(resumo.taxas_entrega)} />
            <Indicador
              rotulo="Cancelados"
              valor={String(resumo.cancelados)}
              rodape={resumo.nao_pagos > 0 ? `+ ${resumo.nao_pagos} não pagos` : undefined}
              alerta={resumo.cancelados > 0}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ---------------- vendas por dia ---------------- */}
            <Cartao className="p-4 lg:col-span-2">
              <h2 className="mb-3 font-bold text-tinta-900">Vendas por dia</h2>
              <Barras
                itens={r.por_dia.map((d) => ({
                  rotulo: d.rotulo,
                  valor: d.total,
                  detalhe: `${d.pedidos} ped.`,
                }))}
              />
            </Cartao>

            {/* ---------------- movimento por hora ---------------- */}
            <Cartao className="p-4">
              <h2 className="font-bold text-tinta-900">Movimento por hora</h2>
              <p className="mb-3 text-xs text-tinta-500">
                Onde está o pico do dia. Serve para montar a escala da equipe.
              </p>
              <Barras
                itens={r.por_hora.map((h) => ({
                  rotulo: `${String(h.hora).padStart(2, '0')}h`,
                  valor: h.total,
                  detalhe: `${h.pedidos} ped.`,
                }))}
              />
            </Cartao>

            {/* ---------------- dia da semana ---------------- */}
            <Cartao className="p-4">
              <h2 className="font-bold text-tinta-900">Por dia da semana</h2>
              <p className="mb-3 text-xs text-tinta-500">Qual dia puxa e qual dia é fraco.</p>
              <Barras
                itens={r.por_dia_semana.map((d) => ({
                  rotulo: DIAS_SEMANA[d.dia_semana].slice(0, 3),
                  valor: d.total,
                  detalhe: `${d.pedidos} ped.`,
                }))}
              />
            </Cartao>

            {/* ---------------- produtos ---------------- */}
            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Produtos que mais vendem</h2>
              <Tabela
                colunas={['Produto', 'Qtd', 'Faturou']}
                linhas={r.produtos
                  .slice(0, 15)
                  .map((p) => [p.nome, String(p.quantidade), moeda(p.total)])}
                comBarra={r.produtos.slice(0, 15).map((p) => p.total)}
              />
            </Cartao>

            {/* ---------------- categorias ---------------- */}
            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Por categoria</h2>
              <Tabela
                colunas={['Categoria', 'Qtd', 'Faturou']}
                linhas={r.categorias.map((c) => [c.nome, String(c.quantidade), moeda(c.total)])}
                comBarra={r.categorias.map((c) => c.total)}
              />
            </Cartao>

            {/* ---------------- onde consomem ---------------- */}
            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Salão, retirada ou entrega</h2>
              <Tabela
                colunas={['Onde', 'Pedidos', 'Ticket', 'Faturou']}
                linhas={r.por_tipo.map((t) => [
                  ROTULO_TIPO[t.tipo] ?? t.tipo,
                  String(t.pedidos),
                  moeda(t.ticket),
                  moeda(t.total),
                ])}
                comBarra={r.por_tipo.map((t) => t.total)}
              />
            </Cartao>

            {/* ---------------- pagamento ---------------- */}
            <Cartao className="p-4">
              <h2 className="mb-3 font-bold text-tinta-900">Como pagaram</h2>
              <Tabela
                colunas={['Forma', 'Pedidos', 'Faturou']}
                linhas={r.por_pagamento.map((p) => [
                  `${ROTULO_FORMA[p.forma] ?? p.forma}${p.metodo !== '-' ? ` · ${p.metodo}` : ''}`,
                  String(p.pedidos),
                  moeda(p.total),
                ])}
                comBarra={r.por_pagamento.map((p) => p.total)}
              />
            </Cartao>

            {/* ---------------- cupons ---------------- */}
            {r.cupons.length > 0 && (
              <Cartao className="p-4">
                <h2 className="font-bold text-tinta-900">Cupons</h2>
                <p className="mb-3 text-xs text-tinta-500">
                  Quanto de desconto saiu e quanto ele trouxe de volta.
                </p>
                <Tabela
                  colunas={['Cupom', 'Usos', 'Desconto', 'Vendeu']}
                  linhas={r.cupons.map((c) => [
                    c.codigo,
                    String(c.usos),
                    `−${moeda(c.desconto)}`,
                    moeda(c.vendeu),
                  ])}
                />
              </Cartao>
            )}

            {/* ---------------- bairros ---------------- */}
            {r.bairros.length > 0 && (
              <Cartao className="p-4">
                <h2 className="mb-3 font-bold text-tinta-900">Entregas por bairro</h2>
                <Tabela
                  colunas={['Bairro', 'Pedidos', 'Taxas', 'Faturou']}
                  linhas={r.bairros.map((b) => [
                    b.bairro,
                    String(b.pedidos),
                    moeda(b.taxas),
                    moeda(b.total),
                  ])}
                  comBarra={r.bairros.map((b) => b.total)}
                />
              </Cartao>
            )}

            {/* ---------------- mesas ---------------- */}
            {r.mesas.length > 0 && (
              <Cartao className="p-4">
                <h2 className="mb-3 font-bold text-tinta-900">Consumo por mesa</h2>
                <Tabela
                  colunas={['Mesa', 'Pedidos', 'Faturou']}
                  linhas={r.mesas.map((m) => [`Mesa ${m.mesa}`, String(m.pedidos), moeda(m.total)])}
                  comBarra={r.mesas.map((m) => m.total)}
                />
              </Cartao>
            )}
          </div>

          {/* ---------------- clientes ---------------- */}
          <Cartao className="mt-4 p-4">
            <h2 className="mb-3 font-bold text-tinta-900">Clientes do período</h2>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <UserPlus className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xl font-black text-tinta-900 tabular-nums">
                    {r.clientes.novos}
                  </span>
                  <span className="block text-xs text-tinta-500">compraram pela 1ª vez</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Users className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xl font-black text-tinta-900 tabular-nums">
                    {r.clientes.recorrentes}
                  </span>
                  <span className="block text-xs text-tinta-500">já eram clientes e voltaram</span>
                </span>
              </div>
              {r.clientes.novos + r.clientes.recorrentes > 0 && (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-marca-50 text-marca-600">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xl font-black text-tinta-900 tabular-nums">
                      {Math.round(
                        (r.clientes.recorrentes / (r.clientes.novos + r.clientes.recorrentes)) * 100
                      )}
                      %
                    </span>
                    <span className="block text-xs text-tinta-500">taxa de retorno</span>
                  </span>
                </div>
              )}
            </div>
            <Link
              href="/admin/clientes?filtro=sumidos"
              className="mt-3 inline-block text-sm font-semibold text-tinta-600 underline underline-offset-2"
            >
              Ver quem sumiu há mais de 30 dias
            </Link>
          </Cartao>
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------- peças

function Indicador({
  rotulo,
  valor,
  rodape,
  destaque = false,
  alerta = false,
}: {
  rotulo: string
  valor: string
  rodape?: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <Cartao className={`p-3.5 ${destaque ? 'border-marca' : ''}`}>
      <p className="text-xs font-medium text-tinta-500">{rotulo}</p>
      <p
        className={`mt-0.5 text-xl font-black tabular-nums ${
          alerta ? 'text-marca-600' : destaque ? 'text-marca' : 'text-tinta-900'
        }`}
      >
        {valor}
      </p>
      {rodape && <p className="mt-0.5 text-xs text-tinta-400">{rodape}</p>}
    </Cartao>
  )
}

/** Barras horizontais em CSS puro — nada de biblioteca de gráfico para isto. */
function Barras({ itens }: { itens: { rotulo: string; valor: number; detalhe?: string }[] }) {
  const maior = Math.max(1, ...itens.map((i) => i.valor))

  return (
    <div className="space-y-1">
      {itens.map((item) => (
        <div key={item.rotulo} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-xs text-tinta-400 tabular-nums">{item.rotulo}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-tinta-100">
            <div
              className="bg-marca h-full rounded"
              style={{ width: `${Math.max(2, (item.valor / maior) * 100)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-medium text-tinta-600 tabular-nums">
            {moeda(item.valor)}
          </span>
          {item.detalhe && (
            <span className="hidden w-14 shrink-0 text-right text-xs text-tinta-400 sm:block">
              {item.detalhe}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Tabela({
  colunas,
  linhas,
  comBarra,
}: {
  colunas: string[]
  linhas: string[][]
  comBarra?: number[]
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-tinta-400">Sem dados no período.</p>
  }
  const maior = comBarra ? Math.max(1, ...comBarra) : 0

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-tinta-400">
            {colunas.map((c, i) => (
              <th key={c} className={`pb-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            <tr key={`${linha[0]}-${indice}`} className="border-t border-tinta-100">
              <td className="py-1.5 pr-2">
                <span className="block truncate text-tinta-900">{linha[0]}</span>
                {comBarra && (
                  <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-tinta-100">
                    <span
                      className="bg-marca block h-full rounded-full"
                      style={{ width: `${(comBarra[indice] / maior) * 100}%` }}
                    />
                  </span>
                )}
              </td>
              {linha.slice(1).map((celula, i) => (
                <td
                  key={i}
                  className={`py-1.5 pl-2 text-right tabular-nums ${
                    i === linha.length - 2 ? 'font-semibold text-tinta-900' : 'text-tinta-600'
                  }`}
                >
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
