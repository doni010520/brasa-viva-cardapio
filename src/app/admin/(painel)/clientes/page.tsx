import Link from 'next/link'
import { Cake, Phone, Search, TrendingDown } from 'lucide-react'
import { Campo, Cartao, Selo, Vazio } from '@/components/ui'
import { linkWhatsapp, moeda } from '@/lib/format'
import { criarClienteAdmin, usuarioAdminAtual } from '@/lib/supabase/server'
import { partesNoFuso } from '@/lib/tempo'
import type { Cliente } from '@/lib/types'

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Filtro = 'todos' | 'sumidos' | 'aniversariantes' | 'melhores'

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'melhores', rotulo: 'Quem mais gasta' },
  { chave: 'sumidos', rotulo: 'Sumidos há 30+ dias' },
  { chave: 'aniversariantes', rotulo: 'Aniversariantes do mês' },
]

function diasDesde(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; filtro?: Filtro }>
}) {

  // O proxy já barra o atendente, mas a página confere de novo: se um dia o
  // matcher mudar, esta tela não vira porta aberta sem ninguém perceber.
  const quemEstaVendo = await usuarioAdminAtual()
  if (!quemEstaVendo?.ehDono) redirect('/admin?motivo=so_dono')
  const { busca = '', filtro = 'todos' } = await searchParams
  const supabase = criarClienteAdmin()

  let query = supabase.from('clientes').select('*').limit(300)

  if (busca.trim()) {
    const termo = busca.trim()
    const digitos = termo.replace(/\D/g, '')
    query = query.or(
      digitos.length >= 3
        ? `nome.ilike.%${termo}%,telefone.ilike.%${digitos}%`
        : `nome.ilike.%${termo}%`
    )
  }

  const mesAtual = partesNoFuso().mes

  if (filtro === 'melhores') query = query.order('total_gasto_centavos', { ascending: false })
  else if (filtro === 'sumidos') {
    const corte = new Date(Date.now() - 30 * 86400000).toISOString()
    query = query.lt('ultimo_pedido_em', corte).order('ultimo_pedido_em', { ascending: true })
  } else query = query.order('ultimo_pedido_em', { ascending: false, nullsFirst: false })

  const { data } = await query
  let clientes = (data ?? []) as Cliente[]

  // aniversariantes: o mês vem da data, e o Postgrest não filtra por parte de data
  if (filtro === 'aniversariantes') {
    clientes = clientes
      .filter((c) => c.data_nascimento && Number(c.data_nascimento.slice(5, 7)) === mesAtual)
      .sort((a, b) => a.data_nascimento!.slice(8) .localeCompare(b.data_nascimento!.slice(8)))
  }

  const totalGasto = clientes.reduce((s, c) => s + c.total_gasto_centavos, 0)

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Clientes</h1>
        <p className="text-sm text-tinta-500">
          A lista se monta sozinha a cada pedido — ninguém precisa criar conta. O telefone é a
          identidade da pessoa.
        </p>
      </div>

      <form className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-tinta-400" />
          <Campo
            name="busca"
            defaultValue={busca}
            placeholder="Buscar por nome ou telefone..."
            className="pl-9"
          />
        </div>
        <input type="hidden" name="filtro" value={filtro} />
      </form>

      <div className="sem-barra mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <Link
            key={f.chave}
            href={`/admin/clientes?filtro=${f.chave}${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              filtro === f.chave
                ? 'bg-tinta-900 text-white'
                : 'border border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300'
            }`}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Clientes na lista" valor={String(clientes.length)} />
        <Indicador rotulo="Já gastaram" valor={moeda(totalGasto)} />
        <Indicador
          rotulo="Ticket médio"
          valor={moeda(
            clientes.length
              ? Math.round(
                  totalGasto / Math.max(1, clientes.reduce((s, c) => s + c.total_pedidos, 0))
                )
              : 0
          )}
        />
      </div>

      {clientes.length === 0 ? (
        <Vazio
          titulo="Nenhum cliente aqui"
          descricao={
            filtro === 'todos'
              ? 'Assim que o primeiro pedido entrar, a pessoa aparece nesta lista.'
              : 'Nenhum cliente se encaixa neste filtro agora.'
          }
        />
      ) : (
        <div className="space-y-2">
          {clientes.map((cliente) => (
            <LinhaCliente key={cliente.id} cliente={cliente} />
          ))}
        </div>
      )}
    </>
  )
}

function LinhaCliente({ cliente }: { cliente: Cliente }) {
  const dias = diasDesde(cliente.ultimo_pedido_em)
  const sumido = dias !== null && dias >= 30
  const aniversario = cliente.data_nascimento
    ? `${cliente.data_nascimento.slice(8)}/${cliente.data_nascimento.slice(5, 7)}`
    : null
  const fazAniversarioEsteMes =
    cliente.data_nascimento &&
    Number(cliente.data_nascimento.slice(5, 7)) === partesNoFuso().mes

  return (
    <Cartao className="flex flex-wrap items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-tinta-900">{cliente.nome}</span>
          {fazAniversarioEsteMes && (
            <Selo tom="vermelho">
              <Cake className="h-3 w-3" />
              {aniversario}
            </Selo>
          )}
          {sumido && (
            <Selo tom="ambar">
              <TrendingDown className="h-3 w-3" />
              sumiu há {dias} dias
            </Selo>
          )}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-tinta-500">
          <a
            href={linkWhatsapp(cliente.telefone, `Olá ${cliente.nome}!`)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-emerald-700 hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            {cliente.telefone}
          </a>
          {cliente.email && <span className="truncate">{cliente.email}</span>}
          {aniversario && !fazAniversarioEsteMes && (
            <span className="flex items-center gap-1">
              <Cake className="h-3.5 w-3.5" />
              {aniversario}
            </span>
          )}
        </p>
      </div>

      <div className="flex gap-5 text-right">
        <div>
          <p className="text-xs text-tinta-400">Pedidos</p>
          <p className="font-bold text-tinta-900 tabular-nums">{cliente.total_pedidos}</p>
        </div>
        <div>
          <p className="text-xs text-tinta-400">Total gasto</p>
          <p className="font-bold text-tinta-900 tabular-nums">
            {moeda(cliente.total_gasto_centavos)}
          </p>
        </div>
        <div>
          <p className="text-xs text-tinta-400">Último</p>
          <p className="font-bold text-tinta-900 tabular-nums">
            {dias === null ? '—' : dias === 0 ? 'hoje' : `${dias}d`}
          </p>
        </div>
      </div>

      <Link
        href={`/admin/clientes/${cliente.id}`}
        className="rounded-lg px-3 py-2 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
      >
        ver pedidos
      </Link>
    </Cartao>
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
