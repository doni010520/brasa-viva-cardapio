'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { ModalProduto } from '@/components/loja/modal-produto'
import { BarraCarrinho } from '@/components/loja/barra-carrinho'
import { Campo, Vazio } from '@/components/ui'
import { moeda } from '@/lib/format'
import type { CategoriaComProdutos, Produto } from '@/lib/types'

export function Cardapio({
  categorias,
  lojaAberta,
}: {
  categorias: CategoriaComProdutos[]
  lojaAberta: boolean
}) {
  const [busca, setBusca] = useState('')
  const [produtoAberto, setProdutoAberto] = useState<Produto | null>(null)
  const [categoriaVisivel, setCategoriaVisivel] = useState(categorias[0]?.id ?? '')
  const secoes = useRef(new Map<string, HTMLElement>())
  const abas = useRef<HTMLDivElement>(null)

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return categorias
    return categorias
      .map((c) => ({
        ...c,
        produtos: c.produtos.filter(
          (p) =>
            p.nome.toLowerCase().includes(termo) ||
            (p.descricao ?? '').toLowerCase().includes(termo)
        ),
      }))
      .filter((c) => c.produtos.length > 0)
  }, [categorias, busca])

  // Marca a aba da categoria que está na tela
  useEffect(() => {
    if (busca) return
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visivel?.target.id) setCategoriaVisivel(visivel.target.id)
      },
      { rootMargin: '-140px 0px -65% 0px' }
    )
    for (const elemento of secoes.current.values()) observador.observe(elemento)
    return () => observador.disconnect()
  }, [busca, filtradas])

  // Mantém a aba ativa visível na régua horizontal
  useEffect(() => {
    const aba = abas.current?.querySelector<HTMLElement>(`[data-aba="${categoriaVisivel}"]`)
    aba?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [categoriaVisivel])

  function irPara(id: string) {
    secoes.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="sticky top-[97px] z-20 -mx-4 bg-tinta-50/95 px-4 pt-1 pb-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-tinta-400" />
          <Campo
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="pl-9"
            aria-label="Buscar no cardápio"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-100"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!busca && categorias.length > 1 && (
          <div ref={abas} className="sem-barra mt-2 flex gap-2 overflow-x-auto pb-1">
            {categorias.map((c) => (
              <button
                key={c.id}
                data-aba={c.id}
                onClick={() => irPara(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  categoriaVisivel === c.id
                    ? 'bg-tinta-900 text-white'
                    : 'border border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300'
                }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtradas.length === 0 ? (
        <div className="py-8">
          <Vazio
            titulo="Nada encontrado"
            descricao={
              busca
                ? `Nenhum item combina com "${busca}".`
                : 'O cardápio ainda não tem itens cadastrados.'
            }
          />
        </div>
      ) : (
        <div className="space-y-8 pt-4">
          {filtradas.map((categoria) => (
            <section
              key={categoria.id}
              id={categoria.id}
              ref={(el) => {
                if (el) secoes.current.set(categoria.id, el)
                else secoes.current.delete(categoria.id)
              }}
              className="scroll-mt-44"
            >
              <h2 className="text-lg font-bold text-tinta-900">{categoria.nome}</h2>
              {categoria.descricao && (
                <p className="text-sm text-tinta-500">{categoria.descricao}</p>
              )}

              <div className="mt-3 space-y-3">
                {categoria.produtos.map((produto) => (
                  <CartaoProduto
                    key={produto.id}
                    produto={produto}
                    onAbrir={() => setProdutoAberto(produto)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {produtoAberto && (
        <ModalProduto
          produto={produtoAberto}
          lojaAberta={lojaAberta}
          onFechar={() => setProdutoAberto(null)}
        />
      )}

      <BarraCarrinho />
    </>
  )
}

function CartaoProduto({ produto, onAbrir }: { produto: Produto; onAbrir: () => void }) {
  const emPromocao =
    produto.preco_promo_centavos !== null && produto.preco_promo_centavos < produto.preco_centavos

  return (
    <button
      onClick={onAbrir}
      disabled={!produto.disponivel}
      className="flex w-full items-stretch gap-3 rounded-2xl border border-tinta-200 bg-white p-3 text-left transition hover:border-tinta-300 disabled:opacity-60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-tinta-900">{produto.nome}</h3>
          {produto.destaque && produto.disponivel && (
            <span className="bg-marca shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              Destaque
            </span>
          )}
        </div>

        {produto.descricao && (
          <p className="mt-1 line-clamp-2 text-sm text-tinta-500">{produto.descricao}</p>
        )}

        <div className="mt-2 flex items-baseline gap-2">
          {produto.disponivel ? (
            <>
              <span className="font-bold text-tinta-900">
                {moeda(emPromocao ? produto.preco_promo_centavos! : produto.preco_centavos)}
              </span>
              {emPromocao && (
                <span className="text-sm text-tinta-400 line-through">
                  {moeda(produto.preco_centavos)}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm font-semibold text-tinta-500">Esgotado hoje</span>
          )}
        </div>
      </div>

      {produto.imagem_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={produto.imagem_url}
          alt={produto.nome}
          className="h-24 w-24 shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      )}
    </button>
  )
}
