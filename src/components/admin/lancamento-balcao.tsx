'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, CreditCard, Loader2, Minus, Plus, QrCode, Scale, Trash2 } from 'lucide-react'
import { lancarPedidoBalcaoAction } from '@/app/admin/(painel)/balcao/acoes'
import { precoDaLinha, ProvedorCarrinho, type EntradaCarrinho } from '@/components/carrinho-contexto'
import { ModalProduto } from '@/components/loja/modal-produto'
import { Botao, Campo, Cartao, Rotulo } from '@/components/ui'
import { moeda, paraCentavos } from '@/lib/format'
import { rotuloOpcao } from '@/lib/types'
import type { CategoriaComProdutos, Produto } from '@/lib/types'

type Metodo = 'pix' | 'cartao' | 'dinheiro'

const METODOS: { valor: Metodo; rotulo: string; icone: typeof QrCode }[] = [
  { valor: 'pix', rotulo: 'Pix', icone: QrCode },
  { valor: 'cartao', rotulo: 'Cartão', icone: CreditCard },
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: Banknote },
]

/**
 * A caixa registradora do balcão.
 *
 * Duas entradas: o valor da balança (quilo, digitado) e itens do cardápio
 * (montados no MESMO modal que o cliente usa no site — as regras de opções
 * valem igual). Tudo isso vira UM pedido, que nasce pago e recebido.
 *
 * O ProvedorCarrinho aqui existe só para o modal não quebrar: o item não vai
 * para o carrinho do site, vai para o lançamento (via aoConfirmar).
 */
export function LancamentoBalcao({ categorias }: { categorias: CategoriaComProdutos[] }) {
  return (
    <ProvedorCarrinho>
      <Caixa categorias={categorias} />
    </ProvedorCarrinho>
  )
}

function Caixa({ categorias }: { categorias: CategoriaComProdutos[] }) {
  const router = useRouter()
  const [lancando, lancar] = useTransition()

  const [quilo, setQuilo] = useState('')
  const [itens, setItens] = useState<EntradaCarrinho[]>([])
  const [clienteNome, setClienteNome] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('pix')
  const [produtoAberto, setProdutoAberto] = useState<Produto | null>(null)
  const [erro, setErro] = useState('')
  const [ultimo, setUltimo] = useState<number | null>(null)

  const quiloCentavos = quilo ? paraCentavos(quilo) : 0
  const totalItens = itens.reduce((s, i) => s + precoDaLinha(i) * i.quantidade, 0)
  const total = quiloCentavos + totalItens
  const podeLancar = total > 0 && !lancando

  const produtos = useMemo(() => categorias.flatMap((c) => c.produtos), [categorias])

  function adicionarItem(item: EntradaCarrinho) {
    setItens((atuais) => [...atuais, item])
  }

  function mudarQuantidade(indice: number, delta: number) {
    setItens((atuais) =>
      atuais
        .map((i, n) => (n === indice ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0)
    )
  }

  function limpar() {
    setQuilo('')
    setItens([])
    setClienteNome('')
    setMetodo('pix')
    setErro('')
  }

  function confirmar() {
    if (!podeLancar) return
    setErro('')
    lancar(async () => {
      const resposta = await lancarPedidoBalcaoAction({
        quiloCentavos,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          // id repetido = quantidade da opção, mesmo contrato do checkout
          opcaoIds: i.opcoes.flatMap((o) => Array<string>(o.quantidade ?? 1).fill(o.id)),
        })),
        clienteNome,
        metodo,
      })
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setUltimo(resposta.numero)
      limpar()
      router.refresh()
    })
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-5">
      {/* ------------------------------------------------ o lançamento */}
      <div className="space-y-4 lg:col-span-3">
        <Cartao className="p-4">
          <Rotulo htmlFor="quilo">
            <span className="flex items-center gap-1.5">
              <Scale className="h-4 w-4" />
              Refeição no quilo — valor da balança
            </span>
          </Rotulo>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold text-tinta-400">R$</span>
            <Campo
              id="quilo"
              inputMode="decimal"
              autoFocus
              value={quilo}
              onChange={(e) => setQuilo(e.target.value)}
              placeholder="0,00"
              className="h-16 text-3xl font-black tabular-nums"
            />
          </div>
          <p className="mt-1.5 text-xs text-tinta-400">
            Deixe em branco se a pessoa não pegou quilo (só bebida, por exemplo).
          </p>
        </Cartao>

        <Cartao className="p-4">
          <p className="font-semibold text-tinta-900">Mais alguma coisa do cardápio?</p>
          <p className="text-xs text-tinta-500">Toque no produto; opções e adicionais abrem como no site.</p>

          <div className="mt-3 space-y-3">
            {categorias.map((categoria) => (
              <div key={categoria.id}>
                <p className="mb-1.5 text-xs font-bold tracking-wide text-tinta-500 uppercase">
                  {categoria.nome}
                </p>
                <div className="flex flex-wrap gap-2">
                  {categoria.produtos.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => setProdutoAberto(produto)}
                      className="rounded-xl border border-tinta-200 bg-white px-3 py-2 text-left text-sm transition hover:border-tinta-400 hover:bg-tinta-50"
                    >
                      <span className="block font-semibold text-tinta-900">{produto.nome}</span>
                      <span className="block text-xs text-tinta-500">
                        {moeda(produto.preco_promo_centavos ?? produto.preco_centavos)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {produtos.length === 0 && (
              <p className="text-sm text-tinta-400">Nenhum produto disponível no cardápio agora.</p>
            )}
          </div>
        </Cartao>
      </div>

      {/* ------------------------------------------------ o resumo e o fechamento */}
      <div className="lg:col-span-2">
        <Cartao className="sticky top-28 p-4">
          <p className="font-bold text-tinta-900">Resumo</p>

          <ul className="mt-3 space-y-2 text-sm">
            {quiloCentavos > 0 && (
              <li className="flex justify-between gap-2">
                <span className="text-tinta-700">Refeição no quilo</span>
                <span className="font-semibold tabular-nums">{moeda(quiloCentavos)}</span>
              </li>
            )}
            {itens.map((item, indice) => (
              <li key={indice} className="rounded-lg bg-tinta-50 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-tinta-900">
                    {item.nome}
                    {item.opcoes.length > 0 && (
                      <span className="block text-xs text-tinta-500">
                        {item.opcoes.map((o) => rotuloOpcao(o)).join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {moeda(precoDaLinha(item) * item.quantidade)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(indice, -1)}
                    className="rounded-md border border-tinta-200 bg-white p-1 text-tinta-600"
                    aria-label="Diminuir"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">
                    {item.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(indice, 1)}
                    className="rounded-md border border-tinta-200 bg-white p-1 text-tinta-600"
                    aria-label="Aumentar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(indice, -item.quantidade)}
                    className="ml-auto rounded-md p-1 text-tinta-400 hover:text-marca-600"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {total === 0 && (
              <li className="text-tinta-400">Nada lançado ainda.</li>
            )}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-tinta-200 pt-3">
            <span className="font-bold text-tinta-900">Total</span>
            <span className="text-2xl font-black tabular-nums text-tinta-900">{moeda(total)}</span>
          </div>

          <div className="mt-4">
            <Rotulo htmlFor="cliente">Nome do cliente (opcional, sai no recibo)</Rotulo>
            <Campo
              id="cliente"
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Ex.: Maria"
            />
          </div>

          <div className="mt-4">
            <Rotulo>Como pagou</Rotulo>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {METODOS.map(({ valor, rotulo, icone: Icone }) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setMetodo(valor)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                    metodo === valor
                      ? 'border-tinta-900 bg-tinta-900 text-white'
                      : 'border-tinta-200 bg-white text-tinta-700 hover:border-tinta-400'
                  }`}
                >
                  <Icone className="h-4 w-4" />
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          {erro && <p className="mt-3 text-sm font-medium text-marca-600">{erro}</p>}
          {ultimo !== null && !erro && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Pedido #{String(ultimo).padStart(3, '0')} lançado — comanda e recibo foram para a
              impressora.
            </p>
          )}

          <Botao onClick={confirmar} disabled={!podeLancar} className="mt-4 h-12 w-full text-base">
            {lancando && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar {total > 0 && moeda(total)}
          </Botao>
          {(quiloCentavos > 0 || itens.length > 0) && (
            <Botao variante="fantasma" onClick={limpar} disabled={lancando} className="mt-2 w-full">
              Limpar
            </Botao>
          )}
        </Cartao>
      </div>

      {produtoAberto && (
        <ModalProduto
          produto={produtoAberto}
          lojaAberta
          onFechar={() => setProdutoAberto(null)}
          aoConfirmar={adicionarItem}
        />
      )}
    </div>
  )
}
