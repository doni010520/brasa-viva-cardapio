import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Cake, Phone } from 'lucide-react'
import { Cartao, Selo, Vazio } from '@/components/ui'
import { linkWhatsapp, moeda } from '@/lib/format'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { dataHoraCurta } from '@/lib/tempo'
import { ROTULO_TIPO_ENTREGA, rotuloStatus, type Cliente, type Pedido } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Ficha do cliente: o histórico completo dele, para o dono conhecer quem compra. */
export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = criarClienteAdmin()

  const { data: clienteBruto } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!clienteBruto) notFound()
  const cliente = clienteBruto as Cliente

  const { data: pedidosBrutos } = await supabase
    .from('pedidos')
    .select('*, itens:pedido_itens(*)')
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false })
    .limit(100)

  const pedidos = (pedidosBrutos ?? []) as Pedido[]

  // o que essa pessoa mais pede
  const contagem = new Map<string, number>()
  for (const pedido of pedidos) {
    for (const item of pedido.itens ?? []) {
      contagem.set(item.produto_nome, (contagem.get(item.produto_nome) ?? 0) + item.quantidade)
    }
  }
  const favoritos = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <>
      <Link
        href="/admin/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos clientes
      </Link>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">{cliente.nome}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-tinta-500">
        <a
          href={linkWhatsapp(cliente.telefone, `Olá ${cliente.nome}!`)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-medium text-emerald-700 hover:underline"
        >
          <Phone className="h-4 w-4" />
          {cliente.telefone}
        </a>
        {cliente.email && <span>{cliente.email}</span>}
        {cliente.data_nascimento && (
          <span className="flex items-center gap-1">
            <Cake className="h-4 w-4" />
            {cliente.data_nascimento.slice(8)}/{cliente.data_nascimento.slice(5, 7)}
          </span>
        )}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Pedidos" valor={String(cliente.total_pedidos)} />
        <Indicador rotulo="Total gasto" valor={moeda(cliente.total_gasto_centavos)} />
        <Indicador
          rotulo="Ticket médio"
          valor={moeda(
            cliente.total_pedidos
              ? Math.round(cliente.total_gasto_centavos / cliente.total_pedidos)
              : 0
          )}
        />
        <Indicador
          rotulo="Cliente desde"
          valor={
            cliente.primeiro_pedido_em ? dataHoraCurta(cliente.primeiro_pedido_em).split(' às')[0] : '—'
          }
        />
      </div>

      {favoritos.length > 0 && (
        <Cartao className="mt-4 p-4">
          <h2 className="mb-2 font-bold text-tinta-900">O que essa pessoa mais pede</h2>
          <ul className="flex flex-wrap gap-2">
            {favoritos.map(([nome, quantidade]) => (
              <li key={nome}>
                <Selo tom="neutro">
                  {nome} · {quantidade}x
                </Selo>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <h2 className="mt-6 mb-2 font-bold text-tinta-900">Histórico de pedidos</h2>

      {pedidos.length === 0 ? (
        <Vazio titulo="Nenhum pedido ainda" />
      ) : (
        <div className="space-y-2">
          {pedidos.map((pedido) => (
            <Cartao key={pedido.id} className="p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-tinta-900">
                  #{String(pedido.numero).padStart(3, '0')}
                  <span className="ml-2 text-sm font-normal text-tinta-500">
                    {dataHoraCurta(pedido.criado_em)}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Selo tom="neutro">{ROTULO_TIPO_ENTREGA[pedido.tipo_entrega]}</Selo>
                  <Selo tom={pedido.status === 'cancelado' ? 'vermelho' : 'verde'}>
                    {rotuloStatus(pedido.status, pedido.tipo_entrega)}
                  </Selo>
                  <span className="font-bold text-tinta-900 tabular-nums">
                    {moeda(pedido.total_centavos)}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-tinta-500">
                {(pedido.itens ?? [])
                  .map((i) => `${i.quantidade}x ${i.produto_nome}`)
                  .join(', ')}
              </p>
            </Cartao>
          ))}
        </div>
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
