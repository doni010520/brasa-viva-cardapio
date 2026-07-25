'use client'

import Link from 'next/link'
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { precoDaLinha, useCarrinho } from '@/components/carrinho-contexto'
import { Botao, Cartao, Vazio } from '@/components/ui'
import { moeda } from '@/lib/format'

export function ListaCarrinho({
  pedidoMinimoCentavos,
  lojaAberta,
  motivoFechada,
}: {
  pedidoMinimoCentavos: number
  lojaAberta: boolean
  motivoFechada: string
}) {
  const { itens, carregado, subtotalCentavos, alterarQuantidade, remover } = useCarrinho()

  if (!carregado) return <div className="py-16 text-center text-tinta-400">Carregando...</div>

  if (itens.length === 0) {
    return (
      <div className="py-10">
        <Vazio titulo="Seu carrinho está vazio" descricao="Que tal dar uma olhada no cardápio?">
          <Link href="/">
            <Botao>Ver cardápio</Botao>
          </Link>
        </Vazio>
      </div>
    )
  }

  const faltaParaMinimo = pedidoMinimoCentavos - subtotalCentavos
  const podeFechar = lojaAberta && faltaParaMinimo <= 0

  return (
    <div className="py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Continuar comprando
      </Link>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">Seu pedido</h1>

      <div className="mt-4 space-y-3">
        {itens.map((item) => (
          <Cartao key={item.linhaId} className="flex gap-3 p-3">
            {item.imagemUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imagemUrl}
                alt={item.nome}
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-tinta-900">{item.nome}</h2>
                <button
                  onClick={() => remover(item.linhaId)}
                  className="shrink-0 rounded-lg p-1.5 text-tinta-400 transition hover:bg-marca-50 hover:text-marca-600"
                  aria-label={`Remover ${item.nome}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {item.opcoes.length > 0 && (
                <ul className="mt-0.5 text-sm text-tinta-500">
                  {item.opcoes.map((o, i) => (
                    <li key={`${o.grupo}-${o.nome}-${i}`}>
                      {o.nome}
                      {o.preco_extra_centavos > 0 && ` (+ ${moeda(o.preco_extra_centavos)})`}
                    </li>
                  ))}
                </ul>
              )}

              {item.observacao && (
                <p className="mt-1 text-sm text-tinta-500 italic">“{item.observacao}”</p>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-tinta-200 p-0.5">
                  <button
                    onClick={() => alterarQuantidade(item.linhaId, item.quantidade - 1)}
                    className="rounded-lg p-1.5 text-tinta-600 hover:bg-tinta-100"
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums">
                    {item.quantidade}
                  </span>
                  <button
                    onClick={() => alterarQuantidade(item.linhaId, item.quantidade + 1)}
                    className="rounded-lg p-1.5 text-tinta-600 hover:bg-tinta-100"
                    aria-label="Aumentar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="font-bold text-tinta-900 tabular-nums">
                  {moeda(precoDaLinha(item) * item.quantidade)}
                </span>
              </div>
            </div>
          </Cartao>
        ))}
      </div>

      <Cartao className="mt-4 p-4">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Subtotal</span>
          <span className="tabular-nums">{moeda(subtotalCentavos)}</span>
        </div>
        <p className="mt-1 text-sm text-tinta-500">
          Cupom e forma de pagamento na próxima etapa.
        </p>
      </Cartao>

      {faltaParaMinimo > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          O pedido mínimo é {moeda(pedidoMinimoCentavos)}. Faltam{' '}
          <strong>{moeda(faltaParaMinimo)}</strong>.
        </p>
      )}

      {!lojaAberta && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {motivoFechada} Seu carrinho fica salvo até a gente reabrir.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {podeFechar ? (
            <Link href="/checkout" className="block">
              <Botao className="h-12 w-full text-base">
                Fechar pedido · {moeda(subtotalCentavos)}
              </Botao>
            </Link>
          ) : (
            <Botao disabled className="h-12 w-full text-base">
              {lojaAberta ? `Faltam ${moeda(faltaParaMinimo)}` : 'Loja fechada'}
            </Botao>
          )}
        </div>
      </div>
    </div>
  )
}
