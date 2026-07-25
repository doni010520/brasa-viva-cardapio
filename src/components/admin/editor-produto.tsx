'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  enviarImagemAction,
  excluirGrupoAction,
  excluirOpcaoAction,
  excluirProdutoAction,
  salvarGrupoAction,
  salvarOpcaoAction,
  salvarProdutoAction,
} from '@/app/admin/(painel)/cardapio/acoes'
import { AreaTexto, Botao, Campo, Cartao, Rotulo, Selecao } from '@/components/ui'
import { centavosParaInput, moeda, paraCentavos } from '@/lib/format'
import type { GrupoOpcoes, Produto } from '@/lib/types'

export function EditorProduto({
  produto,
  categorias,
  categoriaPadrao,
}: {
  produto: Produto | null
  categorias: { id: string; nome: string }[]
  categoriaPadrao: string
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [categoriaId, setCategoriaId] = useState(produto?.categoria_id ?? categoriaPadrao)
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [preco, setPreco] = useState(centavosParaInput(produto?.preco_centavos))
  const [precoPromo, setPrecoPromo] = useState(centavosParaInput(produto?.preco_promo_centavos))
  const [imagemUrl, setImagemUrl] = useState(produto?.imagem_url ?? '')
  const [disponivel, setDisponivel] = useState(produto?.disponivel ?? true)
  const [destaque, setDestaque] = useState(produto?.destaque ?? false)
  const [ordem, setOrdem] = useState(String(produto?.ordem ?? 0))

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    salvar(async () => {
      const resposta = await salvarProdutoAction({
        id: produto?.id,
        categoria_id: categoriaId,
        nome,
        descricao,
        preco_centavos: paraCentavos(preco),
        preco_promo_centavos: precoPromo ? paraCentavos(precoPromo) : null,
        imagem_url: imagemUrl || null,
        disponivel,
        destaque,
        ordem,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      if (!produto && resposta.dados) {
        // recém-criado: leva para a própria página, onde dá para montar as opções
        router.replace(`/admin/cardapio/${resposta.dados.id}`)
        return
      }

      setAviso('Alterações salvas.')
      router.refresh()
    })
  }

  function excluir() {
    if (!produto) return
    if (!confirm(`Apagar "${produto.nome}" do cardápio?`)) return
    salvar(async () => {
      const resposta = await excluirProdutoAction(produto.id)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      router.push('/admin/cardapio')
    })
  }

  return (
    <>
      <Link
        href="/admin/cardapio"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao cardápio
      </Link>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">
        {produto ? produto.nome : 'Novo produto'}
      </h1>

      <form onSubmit={enviar} className="mt-5 grid gap-4 lg:grid-cols-3">
        <Cartao className="space-y-3 p-4 lg:col-span-2">
          <div>
            <Rotulo htmlFor="nome">Nome</Rotulo>
            <Campo
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Espeto de picanha"
            />
          </div>

          <div>
            <Rotulo htmlFor="descricao">Descrição</Rotulo>
            <AreaTexto
              id="descricao"
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que vai no prato, quantas pessoas serve..."
              maxLength={300}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="preco">Preço (R$)</Rotulo>
              <Campo
                id="preco"
                required
                inputMode="decimal"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="22,00"
              />
            </div>
            <div>
              <Rotulo htmlFor="promo">Preço promocional (opcional)</Rotulo>
              <Campo
                id="promo"
                inputMode="decimal"
                value={precoPromo}
                onChange={(e) => setPrecoPromo(e.target.value)}
                placeholder="19,90"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="categoria">Categoria</Rotulo>
              <Selecao
                id="categoria"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </div>
            <div>
              <Rotulo htmlFor="ordem">Posição na categoria</Rotulo>
              <Campo
                id="ordem"
                type="number"
                min={0}
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={disponivel}
                onChange={(e) => setDisponivel(e.target.checked)}
                className="h-4 w-4 accent-black"
              />
              <span className="text-sm text-tinta-700">Disponível para venda</span>
            </label>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={destaque}
                onChange={(e) => setDestaque(e.target.checked)}
                className="h-4 w-4 accent-black"
              />
              <span className="text-sm text-tinta-700">Marcar como destaque</span>
            </label>
          </div>
        </Cartao>

        <div className="space-y-4">
          <Cartao className="p-4">
            <Rotulo>Foto do prato</Rotulo>
            <SeletorImagem url={imagemUrl} onMudar={setImagemUrl} onErro={setErro} />
          </Cartao>

          <Cartao className="p-4">
            {erro && <p className="mb-3 text-sm font-medium text-marca-600">{erro}</p>}
            {aviso && <p className="mb-3 text-sm font-medium text-emerald-700">{aviso}</p>}

            <Botao type="submit" disabled={salvando} className="h-11 w-full">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {produto ? 'Salvar alterações' : 'Criar produto'}
            </Botao>

            {produto && (
              <Botao
                type="button"
                variante="perigo"
                onClick={excluir}
                disabled={salvando}
                className="mt-2 w-full"
              >
                <Trash2 className="h-4 w-4" />
                Apagar produto
              </Botao>
            )}
          </Cartao>
        </div>
      </form>

      {produto ? (
        <EditorOpcoes produtoId={produto.id} grupos={produto.grupos_opcoes ?? []} />
      ) : (
        <p className="mt-6 rounded-xl bg-tinta-100 px-4 py-3 text-sm text-tinta-600">
          Salve o produto para poder montar os grupos de opções (ponto da carne, adicionais,
          sabor...).
        </p>
      )}
    </>
  )
}

// ------------------------------------------------------------------ imagem

function SeletorImagem({
  url,
  onMudar,
  onErro,
}: {
  url: string
  onMudar: (url: string) => void
  onErro: (mensagem: string) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, enviar] = useTransition()

  function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    if (!arquivo) return

    const formulario = new FormData()
    formulario.append('arquivo', arquivo)

    enviar(async () => {
      const resposta = await enviarImagemAction(formulario)
      if (!resposta.ok) onErro(resposta.erro)
      else if (resposta.dados) onMudar(resposta.dados.url)
      if (entrada.current) entrada.current.value = ''
    })
  }

  return (
    <div>
      {url ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-40 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onMudar('')}
            className="absolute top-2 right-2 rounded-full bg-white p-1.5 shadow-md"
            aria-label="Remover foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={enviando}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-tinta-300 text-tinta-400 transition hover:border-tinta-400 hover:text-tinta-600"
        >
          {enviando ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm font-medium">Escolher foto</span>
              <span className="text-xs">JPG, PNG ou WEBP até 5 MB</span>
            </>
          )}
        </button>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={aoEscolher}
        className="hidden"
      />

      {url && (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="mt-2 text-xs font-semibold text-tinta-500 underline underline-offset-2"
        >
          trocar foto
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------- grupos de opções

function EditorOpcoes({ produtoId, grupos }: { produtoId: string; grupos: GrupoOpcoes[] }) {
  const router = useRouter()
  const [criandoGrupo, setCriandoGrupo] = useState(false)
  const [erro, setErro] = useState('')

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-tinta-900">Grupos de opções</h2>
          <p className="text-sm text-tinta-500">
            Ponto da carne, sabor, adicionais — o que o cliente escolhe ao pedir.
          </p>
        </div>
        <Botao variante="fantasma" onClick={() => setCriandoGrupo(true)}>
          <Plus className="h-4 w-4" />
          Novo grupo
        </Botao>
      </div>

      {erro && (
        <p className="mb-3 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      <div className="space-y-3">
        {grupos.map((grupo) => (
          <BlocoGrupo key={grupo.id} grupo={grupo} produtoId={produtoId} onErro={setErro} />
        ))}
        {grupos.length === 0 && !criandoGrupo && (
          <p className="rounded-xl border border-dashed border-tinta-300 px-4 py-8 text-center text-sm text-tinta-400">
            Nenhum grupo. Este produto vai direto para o carrinho, sem perguntas.
          </p>
        )}
      </div>

      {criandoGrupo && (
        <FormularioGrupo
          produtoId={produtoId}
          grupo={null}
          onFechar={() => setCriandoGrupo(false)}
          onSalvo={() => {
            setCriandoGrupo(false)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}

function BlocoGrupo({
  grupo,
  produtoId,
  onErro,
}: {
  grupo: GrupoOpcoes
  produtoId: string
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [criandoOpcao, setCriandoOpcao] = useState(false)
  const [apagando, apagar] = useTransition()

  function excluir() {
    if (!confirm(`Apagar o grupo "${grupo.nome}" e todas as opções dele?`)) return
    apagar(async () => {
      const resposta = await excluirGrupoAction(grupo.id, produtoId)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  const regra =
    grupo.min_escolhas === 0
      ? `Opcional · até ${grupo.max_escolhas}`
      : grupo.min_escolhas === grupo.max_escolhas
        ? `Obrigatório · escolhe ${grupo.min_escolhas}`
        : `Obrigatório · de ${grupo.min_escolhas} a ${grupo.max_escolhas}`

  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-tinta-900">{grupo.nome}</h3>
          <p className="text-xs text-tinta-500">{regra}</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEditando(true)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
          >
            editar
          </button>
          <button
            onClick={excluir}
            disabled={apagando}
            className="rounded-lg p-1.5 text-tinta-500 hover:bg-marca-50 hover:text-marca-600"
            aria-label={`Apagar grupo ${grupo.nome}`}
          >
            {apagando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {grupo.opcoes.map((opcao) => (
          <LinhaOpcao
            key={opcao.id}
            opcao={opcao}
            grupoId={grupo.id}
            produtoId={produtoId}
            onErro={onErro}
          />
        ))}
      </ul>

      <button
        onClick={() => setCriandoOpcao(true)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-tinta-300 py-2 text-xs font-semibold text-tinta-500 transition hover:border-tinta-400 hover:text-tinta-700"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar opção
      </button>

      {editando && (
        <FormularioGrupo
          produtoId={produtoId}
          grupo={grupo}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false)
            router.refresh()
          }}
        />
      )}

      {criandoOpcao && (
        <FormularioOpcao
          grupoId={grupo.id}
          produtoId={produtoId}
          opcao={null}
          ordemSugerida={grupo.opcoes.length + 1}
          onFechar={() => setCriandoOpcao(false)}
          onSalvo={() => {
            setCriandoOpcao(false)
            router.refresh()
          }}
        />
      )}
    </Cartao>
  )
}

function LinhaOpcao({
  opcao,
  grupoId,
  produtoId,
  onErro,
}: {
  opcao: GrupoOpcoes['opcoes'][number]
  grupoId: string
  produtoId: string
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [apagando, apagar] = useTransition()

  function excluir() {
    apagar(async () => {
      const resposta = await excluirOpcaoAction(opcao.id, produtoId)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  return (
    <>
      <li className="flex items-center gap-2 rounded-lg bg-tinta-50 px-3 py-2">
        <span
          className={`flex-1 text-sm ${
            opcao.disponivel ? 'text-tinta-900' : 'text-tinta-400 line-through'
          }`}
        >
          {opcao.nome}
        </span>
        {opcao.preco_extra_centavos > 0 && (
          <span className="text-sm font-semibold text-tinta-600 tabular-nums">
            + {moeda(opcao.preco_extra_centavos)}
          </span>
        )}
        <button
          onClick={() => setEditando(true)}
          className="rounded px-2 py-1 text-xs font-semibold text-tinta-500 hover:bg-tinta-200"
        >
          editar
        </button>
        <button
          onClick={excluir}
          disabled={apagando}
          className="rounded p-1 text-tinta-400 hover:text-marca-600"
          aria-label={`Apagar opção ${opcao.nome}`}
        >
          {apagando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </li>

      {editando && (
        <FormularioOpcao
          grupoId={grupoId}
          produtoId={produtoId}
          opcao={opcao}
          ordemSugerida={opcao.ordem}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function FormularioGrupo({
  produtoId,
  grupo,
  onFechar,
  onSalvo,
}: {
  produtoId: string
  grupo: GrupoOpcoes | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [min, setMin] = useState(String(grupo?.min_escolhas ?? 0))
  const [max, setMax] = useState(String(grupo?.max_escolhas ?? 1))
  const [ordem, setOrdem] = useState(String(grupo?.ordem ?? 0))

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    salvar(async () => {
      const resposta = await salvarGrupoAction({
        id: grupo?.id,
        produto_id: produtoId,
        nome,
        min_escolhas: min,
        max_escolhas: max,
        ordem,
      })
      if (!resposta.ok) setErro(resposta.erro)
      else onSalvo()
    })
  }

  return (
    <ModalSimples titulo={grupo ? 'Editar grupo' : 'Novo grupo de opções'} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <Rotulo htmlFor="grupo-nome">Nome do grupo</Rotulo>
          <Campo
            id="grupo-nome"
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Ponto da carne"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Rotulo htmlFor="grupo-min">Mínimo</Rotulo>
            <Campo
              id="grupo-min"
              type="number"
              min={0}
              max={20}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="grupo-max">Máximo</Rotulo>
            <Campo
              id="grupo-max"
              type="number"
              min={1}
              max={20}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="grupo-ordem">Posição</Rotulo>
            <Campo
              id="grupo-ordem"
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-tinta-400">
          Mínimo 0 deixa o grupo opcional. Mínimo 1 e máximo 1 vira escolha obrigatória única.
        </p>

        {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}

        <div className="flex gap-2 pt-1">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
        </div>
      </form>
    </ModalSimples>
  )
}

function FormularioOpcao({
  grupoId,
  produtoId,
  opcao,
  ordemSugerida,
  onFechar,
  onSalvo,
}: {
  grupoId: string
  produtoId: string
  opcao: GrupoOpcoes['opcoes'][number] | null
  ordemSugerida: number
  onFechar: () => void
  onSalvo: () => void
}) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState(opcao?.nome ?? '')
  const [preco, setPreco] = useState(centavosParaInput(opcao?.preco_extra_centavos ?? 0))
  const [disponivel, setDisponivel] = useState(opcao?.disponivel ?? true)
  const [ordem, setOrdem] = useState(String(opcao?.ordem ?? ordemSugerida))

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    salvar(async () => {
      const resposta = await salvarOpcaoAction(
        {
          id: opcao?.id,
          grupo_id: grupoId,
          nome,
          preco_extra_centavos: preco ? paraCentavos(preco) : 0,
          disponivel,
          ordem,
        },
        produtoId
      )
      if (!resposta.ok) setErro(resposta.erro)
      else onSalvo()
    })
  }

  return (
    <ModalSimples titulo={opcao ? 'Editar opção' : 'Nova opção'} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <Rotulo htmlFor="opcao-nome">Nome</Rotulo>
          <Campo
            id="opcao-nome"
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Bem passado"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Rotulo htmlFor="opcao-preco">Custa a mais (R$)</Rotulo>
            <Campo
              id="opcao-preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Rotulo htmlFor="opcao-ordem">Posição</Rotulo>
            <Campo
              id="opcao-ordem"
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={disponivel}
            onChange={(e) => setDisponivel(e.target.checked)}
            className="h-4 w-4 accent-black"
          />
          <span className="text-sm text-tinta-700">Disponível</span>
        </label>

        {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}

        <div className="flex gap-2 pt-1">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
        </div>
      </form>
    </ModalSimples>
  )
}

function ModalSimples({
  titulo,
  onFechar,
  children,
}: {
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anima-entrada w-full max-w-md rounded-2xl bg-white p-5"
      >
        <h2 className="mb-4 text-lg font-bold text-tinta-900">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}
