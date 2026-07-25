'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  alternarDisponibilidadeAction,
  excluirCategoriaAction,
  salvarCategoriaAction,
} from '@/app/admin/(painel)/cardapio/acoes'
import { Botao, Campo, Cartao, Rotulo, Selo, Vazio } from '@/components/ui'
import { moeda } from '@/lib/format'
import type { CategoriaComProdutos, Produto } from '@/lib/types'

export function GestaoCardapio({ categorias }: { categorias: CategoriaComProdutos[] }) {
  const [editandoCategoria, setEditandoCategoria] = useState<
    CategoriaComProdutos | 'nova' | null
  >(null)
  const [erro, setErro] = useState('')

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Botao onClick={() => setEditandoCategoria('nova')} variante="fantasma">
          <Plus className="h-4 w-4" />
          Nova categoria
        </Botao>
        <Link href="/admin/cardapio/novo">
          <Botao>
            <Plus className="h-4 w-4" />
            Novo produto
          </Botao>
        </Link>
      </div>

      {erro && (
        <p className="mb-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      {categorias.length === 0 ? (
        <Vazio
          titulo="Cardápio vazio"
          descricao="Crie a primeira categoria (ex.: Espetos, Bebidas) e depois adicione os produtos."
        >
          <Botao onClick={() => setEditandoCategoria('nova')}>Criar categoria</Botao>
        </Vazio>
      ) : (
        <div className="space-y-6">
          {categorias.map((categoria) => (
            <BlocoCategoria
              key={categoria.id}
              categoria={categoria}
              onEditar={() => setEditandoCategoria(categoria)}
              onErro={setErro}
            />
          ))}
        </div>
      )}

      {editandoCategoria && (
        <ModalCategoria
          categoria={editandoCategoria === 'nova' ? null : editandoCategoria}
          onFechar={() => setEditandoCategoria(null)}
        />
      )}
    </>
  )
}

function BlocoCategoria({
  categoria,
  onEditar,
  onErro,
}: {
  categoria: CategoriaComProdutos
  onEditar: () => void
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [apagando, apagar] = useTransition()

  function excluir() {
    if (!confirm(`Apagar a categoria "${categoria.nome}"?`)) return
    apagar(async () => {
      const resposta = await excluirCategoriaAction(categoria.id)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-tinta-300" />
        <h2 className="font-bold text-tinta-900">{categoria.nome}</h2>
        {!categoria.ativo && <Selo tom="ambar">Escondida do cardápio</Selo>}
        <span className="text-xs text-tinta-400">
          {categoria.produtos.length}{' '}
          {categoria.produtos.length === 1 ? 'produto' : 'produtos'}
        </span>

        <div className="ml-auto flex gap-1">
          <button
            onClick={onEditar}
            className="rounded-lg p-2 text-tinta-500 transition hover:bg-tinta-100"
            aria-label={`Editar categoria ${categoria.nome}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={excluir}
            disabled={apagando}
            className="rounded-lg p-2 text-tinta-500 transition hover:bg-marca-50 hover:text-marca-600"
            aria-label={`Apagar categoria ${categoria.nome}`}
          >
            {apagando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {categoria.produtos.length === 0 ? (
        <Link href={`/admin/cardapio/novo?categoria=${categoria.id}`}>
          <div className="rounded-xl border border-dashed border-tinta-300 px-4 py-6 text-center text-sm text-tinta-400 transition hover:border-tinta-400 hover:text-tinta-600">
            + Adicionar o primeiro produto desta categoria
          </div>
        </Link>
      ) : (
        <div className="space-y-2">
          {categoria.produtos.map((produto) => (
            <LinhaProduto key={produto.id} produto={produto} onErro={onErro} />
          ))}
        </div>
      )}
    </section>
  )
}

function LinhaProduto({
  produto,
  onErro,
}: {
  produto: Produto
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()

  function alternar() {
    salvar(async () => {
      const resposta = await alternarDisponibilidadeAction(produto.id, !produto.disponivel)
      if (!resposta.ok) onErro(resposta.erro)
      router.refresh()
    })
  }

  const emPromocao =
    produto.preco_promo_centavos !== null && produto.preco_promo_centavos < produto.preco_centavos

  return (
    <Cartao className={`flex items-center gap-3 p-3 ${produto.disponivel ? '' : 'bg-tinta-50'}`}>
      {produto.imagem_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={produto.imagem_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-tinta-100" />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span
            className={`truncate font-semibold ${
              produto.disponivel ? 'text-tinta-900' : 'text-tinta-400 line-through'
            }`}
          >
            {produto.nome}
          </span>
          {produto.destaque && <Selo tom="vermelho">Destaque</Selo>}
        </p>
        <p className="text-sm text-tinta-500 tabular-nums">
          {emPromocao ? (
            <>
              <span className="font-semibold text-emerald-700">
                {moeda(produto.preco_promo_centavos!)}
              </span>{' '}
              <span className="line-through">{moeda(produto.preco_centavos)}</span>
            </>
          ) : (
            moeda(produto.preco_centavos)
          )}
          {(produto.grupos_opcoes?.length ?? 0) > 0 && (
            <span className="text-tinta-400">
              {' '}
              · {produto.grupos_opcoes!.length} grupo(s) de opções
            </span>
          )}
        </p>
      </div>

      <button
        onClick={alternar}
        disabled={salvando}
        title={produto.disponivel ? 'Marcar como esgotado' : 'Voltar a vender'}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
          produto.disponivel
            ? 'text-emerald-700 hover:bg-emerald-50'
            : 'text-tinta-500 hover:bg-tinta-100'
        }`}
      >
        {salvando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : produto.disponivel ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">
          {produto.disponivel ? 'À venda' : 'Esgotado'}
        </span>
      </button>

      <Link
        href={`/admin/cardapio/${produto.id}`}
        className="shrink-0 rounded-lg p-2 text-tinta-500 transition hover:bg-tinta-100"
        aria-label={`Editar ${produto.nome}`}
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Cartao>
  )
}

function ModalCategoria({
  categoria,
  onFechar,
}: {
  categoria: CategoriaComProdutos | null
  onFechar: () => void
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [descricao, setDescricao] = useState(categoria?.descricao ?? '')
  const [ordem, setOrdem] = useState(String(categoria?.ordem ?? 0))
  const [ativo, setAtivo] = useState(categoria?.ativo ?? true)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    salvar(async () => {
      const resposta = await salvarCategoriaAction({
        id: categoria?.id,
        nome,
        descricao,
        ordem,
        ativo,
      })
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      router.refresh()
      onFechar()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar}
    >
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="anima-entrada w-full max-w-md rounded-2xl bg-white p-5"
      >
        <h2 className="mb-4 text-lg font-bold text-tinta-900">
          {categoria ? 'Editar categoria' : 'Nova categoria'}
        </h2>

        <div className="space-y-3">
          <div>
            <Rotulo htmlFor="cat-nome">Nome</Rotulo>
            <Campo
              id="cat-nome"
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Espetos"
            />
          </div>

          <div>
            <Rotulo htmlFor="cat-desc">Descrição (opcional)</Rotulo>
            <Campo
              id="cat-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: No fogo na hora do pedido"
            />
          </div>

          <div>
            <Rotulo htmlFor="cat-ordem">Posição no cardápio</Rotulo>
            <Campo
              id="cat-ordem"
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
            <p className="mt-1 text-xs text-tinta-400">Menor número aparece primeiro.</p>
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 accent-black"
            />
            <span className="text-sm text-tinta-700">Mostrar esta categoria no cardápio</span>
          </label>
        </div>

        {erro && <p className="mt-3 text-sm font-medium text-marca-600">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
        </div>
      </form>
    </div>
  )
}
