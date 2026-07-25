'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bike,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  Printer,
  Store,
  X,
} from 'lucide-react'
import { mudarStatusAction } from '@/app/admin/(painel)/acoes'
import { Botao, Cartao, Selo, Vazio } from '@/components/ui'
import { linkWhatsapp, moeda } from '@/lib/format'
import { haQuantoTempo, horaCurta } from '@/lib/tempo'
import type { Pedido, StatusPedido } from '@/lib/types'

const COLUNAS: { status: StatusPedido; titulo: string; cor: string }[] = [
  { status: 'recebido', titulo: 'Novos', cor: 'bg-sky-500' },
  { status: 'em_preparo', titulo: 'Em preparo', cor: 'bg-amber-500' },
  { status: 'pronto', titulo: 'Prontos', cor: 'bg-emerald-500' },
  { status: 'saiu_para_entrega', titulo: 'Em rota', cor: 'bg-violet-500' },
]

export function PainelPedidos({ pedidos }: { pedidos: Pedido[] }) {
  const aguardando = pedidos.filter((p) => p.status === 'aguardando_pagamento')
  const temEntrega = pedidos.some((p) => p.tipo_entrega === 'entrega')
  const colunas = temEntrega ? COLUNAS : COLUNAS.filter((c) => c.status !== 'saiu_para_entrega')

  return (
    <>
      {aguardando.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-tinta-500">
            <Clock className="h-4 w-4" />
            Aguardando pagamento ({aguardando.length})
          </h2>
          <p className="mb-2 text-xs text-tinta-400">
            Ainda não entraram na cozinha. Somem daqui sozinhos quando o pagamento cair.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aguardando.map((pedido) => (
              <CartaoPedido key={pedido.id} pedido={pedido} />
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${temEntrega ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {colunas.map((coluna) => {
          const daColuna = pedidos.filter((p) => p.status === coluna.status)

          return (
            <section key={coluna.status}>
              <h2 className="mb-2 flex items-center gap-2 font-bold text-tinta-900">
                <span className={`h-2.5 w-2.5 rounded-full ${coluna.cor}`} />
                {coluna.titulo}
                <span className="rounded-full bg-tinta-100 px-2 py-0.5 text-xs text-tinta-600 tabular-nums">
                  {daColuna.length}
                </span>
              </h2>

              <div className="space-y-3">
                {daColuna.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-tinta-200 px-4 py-8 text-center text-sm text-tinta-400">
                    Nada por aqui
                  </p>
                ) : (
                  daColuna.map((pedido) => <CartaoPedido key={pedido.id} pedido={pedido} />)
                )}
              </div>
            </section>
          )
        })}
      </div>

      {pedidos.length === 0 && (
        <div className="mt-6">
          <Vazio
            titulo="Nenhum pedido em aberto"
            descricao="Assim que alguém pedir pelo cardápio, aparece aqui na hora."
          />
        </div>
      )}
    </>
  )
}

function CartaoPedido({ pedido }: { pedido: Pedido }) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [expandido, setExpandido] = useState(true)

  function mudar(novo: StatusPedido) {
    setErro('')
    salvar(async () => {
      const resposta = await mudarStatusAction(pedido.id, novo)
      if (!resposta.ok) setErro(resposta.erro)
      router.refresh()
    })
  }

  const pago = pedido.status_pagamento === 'pago'
  const ehEntrega = pedido.tipo_entrega === 'entrega'
  const atrasado =
    pedido.retirada_prevista !== null &&
    new Date(pedido.retirada_prevista) < new Date() &&
    !['retirado', 'cancelado'].includes(pedido.status)

  return (
    <Cartao className={`overflow-hidden ${atrasado ? 'border-marca-500' : ''}`}>
      <button
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-start justify-between gap-2 p-3.5 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="text-lg font-black text-tinta-900 tabular-nums">
              #{String(pedido.numero).padStart(3, '0')}
            </span>
            <span className="truncate font-semibold text-tinta-700">{pedido.cliente_nome}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-tinta-500">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                ehEntrega ? 'text-violet-600' : 'text-sky-600'
              }`}
            >
              {ehEntrega ? <Bike className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
              {ehEntrega ? 'Entrega' : 'Retirada'}
            </span>
            <span>· {haQuantoTempo(pedido.criado_em)}</span>
            {pedido.retirada_prevista && (
              <span className={atrasado ? 'font-bold text-marca-600' : ''}>
                · {horaCurta(pedido.retirada_prevista)}
              </span>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold text-tinta-900 tabular-nums">{moeda(pedido.total_centavos)}</p>
          <Selo tom={pago ? 'verde' : pedido.forma_pagamento === 'local' ? 'ambar' : 'neutro'}>
            {pago
              ? 'Pago'
              : pedido.forma_pagamento === 'local'
                ? ehEntrega
                  ? 'Paga na entrega'
                  : 'Paga na retirada'
                : 'Pendente'}
          </Selo>
        </div>
      </button>

      {expandido && (
        <div className="border-t border-tinta-200 px-3.5 py-3">
          <ul className="space-y-1.5 text-sm">
            {(pedido.itens ?? []).map((item) => (
              <li key={item.id}>
                <span className="font-semibold text-tinta-900">
                  {item.quantidade}x {item.produto_nome}
                </span>
                {item.opcoes.length > 0 && (
                  <span className="block pl-4 text-xs text-tinta-500">
                    {item.opcoes.map((o) => o.nome).join(' · ')}
                  </span>
                )}
                {item.observacao && (
                  <span className="mt-0.5 block pl-4 text-xs font-medium text-marca-600">
                    ⚠ {item.observacao}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {pedido.observacoes && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800">
              ⚠ {pedido.observacoes}
            </p>
          )}

          {ehEntrega && (
            <div className="mt-2 flex gap-2 rounded-lg bg-violet-50 px-2.5 py-2 text-xs text-violet-900">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">
                  {pedido.endereco_rua}, {pedido.endereco_numero}
                </strong>
                {pedido.endereco_complemento && ` — ${pedido.endereco_complemento}`}
                <br />
                {pedido.endereco_bairro}
                {pedido.endereco_referencia && (
                  <>
                    <br />
                    <span className="opacity-80">Ref.: {pedido.endereco_referencia}</span>
                  </>
                )}
                {pedido.entrega_taxa_centavos > 0 && (
                  <>
                    <br />
                    <span className="opacity-80">
                      Taxa: {moeda(pedido.entrega_taxa_centavos)}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-tinta-500">
            <a
              href={linkWhatsapp(
                pedido.cliente_telefone,
                `Olá ${pedido.cliente_nome}! Sobre seu pedido #${String(pedido.numero).padStart(3, '0')}:`
              )}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-medium text-emerald-700 hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {pedido.cliente_telefone}
            </a>

            <Link
              href={`/admin/comanda/${pedido.id}`}
              target="_blank"
              className="flex items-center gap-1 font-medium text-tinta-600 hover:underline"
            >
              <Printer className="h-3.5 w-3.5" />
              Comanda
            </Link>

            {pedido.forma_pagamento === 'online' && (
              <span className="flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Online
              </span>
            )}
          </div>
        </div>
      )}

      {erro && <p className="px-3.5 pb-2 text-xs font-medium text-marca-600">{erro}</p>}

      <div className="flex gap-2 border-t border-tinta-200 p-2.5">
        {pedido.status === 'aguardando_pagamento' && (
          <>
            <Botao
              variante="fantasma"
              onClick={() => mudar('recebido')}
              disabled={salvando}
              className="flex-1"
              title="Use se o cliente pagou por fora (Pix direto, por exemplo)"
            >
              Liberar mesmo assim
            </Botao>
            <Botao variante="perigo" onClick={() => mudar('cancelado')} disabled={salvando}>
              <X className="h-4 w-4" />
            </Botao>
          </>
        )}

        {pedido.status === 'recebido' && (
          <>
            <Botao onClick={() => mudar('em_preparo')} disabled={salvando} className="flex-1">
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChefHat className="h-4 w-4" />
              )}
              Começar preparo
            </Botao>
            <Botao variante="perigo" onClick={() => mudar('cancelado')} disabled={salvando}>
              <X className="h-4 w-4" />
            </Botao>
          </>
        )}

        {pedido.status === 'em_preparo' && (
          <Botao onClick={() => mudar('pronto')} disabled={salvando} className="flex-1">
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Marcar como pronto
          </Botao>
        )}

        {pedido.status === 'pronto' && (
          <Botao
            variante="secundario"
            onClick={() => mudar(ehEntrega ? 'saiu_para_entrega' : 'retirado')}
            disabled={salvando}
            className="flex-1"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : ehEntrega ? (
              <Bike className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {ehEntrega ? 'Saiu para entrega' : 'Cliente retirou'}
          </Botao>
        )}

        {pedido.status === 'saiu_para_entrega' && (
          <Botao
            variante="secundario"
            onClick={() => mudar('retirado')}
            disabled={salvando}
            className="flex-1"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Entregue
          </Botao>
        )}
      </div>
    </Cartao>
  )
}
