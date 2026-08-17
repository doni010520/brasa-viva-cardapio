'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  enviarImagemAction,
  excluirGrupoAction,
  excluirOpcaoAction,
  excluirProdutoAction,
  excluirSecaoAction,
  reordenarGruposAction,
  salvarGrupoAction,
  salvarOpcaoAction,
  salvarProdutoAction,
  salvarSecaoAction,
} from '@/app/admin/(painel)/cardapio/acoes'
import { EstadoDoFormulario, useNaoSalvo } from '@/components/admin/nao-salvo'
import { AreaTexto, Botao, Campo, Cartao, Rotulo, Selecao } from '@/components/ui'
import { centavosParaInput, moeda, paraCentavos } from '@/lib/format'
import type { GrupoOpcoes, Produto, SecaoOpcoes } from '@/lib/types'

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
  const [modoConsumo, setModoConsumo] = useState(produto?.modo_consumo ?? 'ambos')

  const { pendente, marcarSalvo } = useNaoSalvo({
    categoriaId,
    nome,
    descricao,
    preco,
    precoPromo,
    imagemUrl,
    disponivel,
    destaque,
    ordem,
    modoConsumo,
  })

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
        modo_consumo: modoConsumo,
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

      marcarSalvo()
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

          {/* São dois cardápios diferentes: quem está na mesa não pode pedir
              marmita embalada, e quem está em casa não pode pedir buffet. */}
          <div>
            <Rotulo htmlFor="modo-consumo">Em qual cardápio aparece</Rotulo>
            <Selecao
              id="modo-consumo"
              value={modoConsumo}
              onChange={(e) => setModoConsumo(e.target.value as typeof modoConsumo)}
            >
              <option value="ambos">Nos dois — no restaurante e para viagem</option>
              <option value="so_local">Só no restaurante (buffet, consumo no salão)</option>
              <option value="so_viagem">Só para viagem (marmita, entrega e retirada)</option>
              <option value="interno">Só o balcão lança (não aparece para o cliente)</option>
            </Selecao>
            <p className="mt-1 text-xs text-tinta-400">
              {modoConsumo === 'so_local'
                ? 'Não aparece para quem pede de casa — ninguém vai levar buffet livre embora.'
                : modoConsumo === 'so_viagem'
                  ? 'Não aparece para quem está sentado no salão.'
                  : modoConsumo === 'interno'
                    ? 'Invisível nos dois cardápios. Só existe para a atendente lançar pelo Balcão.'
                    : 'Aparece para todo mundo, esteja no salão ou pedindo de casa.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={disponivel}
                onChange={(e) => setDisponivel(e.target.checked)}
                className="h-5 w-5 accent-black"
              />
              <span className="text-sm text-tinta-700">Disponível para venda</span>
            </label>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={destaque}
                onChange={(e) => setDestaque(e.target.checked)}
                className="h-5 w-5 accent-black"
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

          <Cartao className="space-y-3 p-4">
            <EstadoDoFormulario
              pendente={pendente}
              aviso={aviso}
              erro={erro}
              // produto novo ainda não existe no banco: "tudo salvo" mentiria
              mostrarTudoSalvo={produto !== null}
            />

            <Botao
              type="submit"
              disabled={salvando || (produto !== null && !pendente)}
              className="h-11 w-full"
            >
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
        <EditorOpcoes
          produtoId={produto.id}
          grupos={produto.grupos_opcoes ?? []}
          secoes={produto.secoes_opcoes ?? []}
        />
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

function EditorOpcoes({
  produtoId,
  grupos,
  secoes,
}: {
  produtoId: string
  grupos: GrupoOpcoes[]
  secoes: SecaoOpcoes[]
}) {
  const router = useRouter()
  const [criandoGrupo, setCriandoGrupo] = useState(false)
  const [criandoSecao, setCriandoSecao] = useState(false)
  const [erro, setErro] = useState('')
  const [reordenando, reordenar] = useTransition()

  // A tela reordena na hora do gesto e o servidor confirma depois; se a
  // gravação falhar, volta para a ordem que o servidor conhece.
  const [ordemOtimista, setOrdemOtimista] = useState<string[] | null>(null)
  const [arrastandoId, setArrastandoId] = useState<string | null>(null)
  const [sobreId, setSobreId] = useState<string | null>(null)

  const gruposOrdenados = useMemo(() => {
    if (!ordemOtimista) return grupos
    const porId = new Map(grupos.map((g) => [g.id, g]))
    const ordenados = ordemOtimista.flatMap((id) => porId.get(id) ?? [])
    // grupo criado depois do gesto entra no fim — nunca some da tela
    return [...ordenados, ...grupos.filter((g) => !ordemOtimista.includes(g.id))]
  }, [grupos, ordemOtimista])

  function aplicarOrdem(ids: string[]) {
    setOrdemOtimista(ids)
    reordenar(async () => {
      const resposta = await reordenarGruposAction({ produto_id: produtoId, ids })
      if (!resposta.ok) {
        setErro(resposta.erro)
        setOrdemOtimista(null)
        return
      }
      router.refresh()
    })
  }

  function mover(id: string, direcao: -1 | 1) {
    const ids = gruposOrdenados.map((g) => g.id)
    const de = ids.indexOf(id)
    const para = de + direcao
    if (de < 0 || para < 0 || para >= ids.length) return
    ;[ids[de], ids[para]] = [ids[para], ids[de]]
    aplicarOrdem(ids)
  }

  function soltar(alvoId: string) {
    const origem = arrastandoId
    setArrastandoId(null)
    setSobreId(null)
    if (!origem || origem === alvoId) return
    const ids = gruposOrdenados.map((g) => g.id).filter((id) => id !== origem)
    ids.splice(ids.indexOf(alvoId), 0, origem)
    aplicarOrdem(ids)
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-tinta-900">Grupos de opções</h2>
          <p className="text-sm text-tinta-500">
            Ponto da carne, sabor, adicionais — o que o cliente escolhe ao pedir.
            {grupos.length > 1 && ' Arraste pela alça (ou use as setas) para mudar a ordem.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Botao variante="fantasma" onClick={() => setCriandoSecao(true)}>
            <Plus className="h-4 w-4" />
            Nova seção
          </Botao>
          <Botao variante="fantasma" onClick={() => setCriandoGrupo(true)}>
            <Plus className="h-4 w-4" />
            Novo grupo
          </Botao>
        </div>
      </div>

      {erro && (
        <p className="mb-3 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      {secoes.length > 0 && (
        <div className="mb-3 space-y-2">
          {secoes.map((secao) => (
            <BlocoSecao
              key={secao.id}
              secao={secao}
              produtoId={produtoId}
              quantosGrupos={grupos.filter((g) => g.secao_id === secao.id).length}
              onErro={setErro}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {gruposOrdenados.map((grupo, indice) => (
          <div
            key={grupo.id}
            onDragOver={(e) => {
              e.preventDefault()
              if (arrastandoId && arrastandoId !== grupo.id) setSobreId(grupo.id)
            }}
            onDragLeave={() => sobreId === grupo.id && setSobreId(null)}
            onDrop={(e) => {
              e.preventDefault()
              soltar(grupo.id)
            }}
            className={`rounded-2xl transition ${
              sobreId === grupo.id ? 'ring-2 ring-tinta-400 ring-offset-2' : ''
            } ${arrastandoId === grupo.id ? 'opacity-50' : ''}`}
          >
            <BlocoGrupo
              grupo={grupo}
              produtoId={produtoId}
              secoes={secoes}
              onErro={setErro}
              aoIniciarArrasto={() => setArrastandoId(grupo.id)}
              aoTerminarArrasto={() => {
                setArrastandoId(null)
                setSobreId(null)
              }}
              aoMover={(direcao) => mover(grupo.id, direcao)}
              podeSubir={indice > 0}
              podeDescer={indice < gruposOrdenados.length - 1}
              reordenando={reordenando}
            />
          </div>
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
          secoes={secoes}
          onFechar={() => setCriandoGrupo(false)}
          onSalvo={() => {
            setCriandoGrupo(false)
            router.refresh()
          }}
        />
      )}

      {criandoSecao && (
        <FormularioSecao
          produtoId={produtoId}
          secao={null}
          onFechar={() => setCriandoSecao(false)}
          onSalvo={() => {
            setCriandoSecao(false)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}

/**
 * A régua da seção no painel: nome, limite do conjunto e quantos grupos
 * estão dentro. Apagar a seção não apaga os grupos — eles ficam soltos.
 */
function BlocoSecao({
  secao,
  produtoId,
  quantosGrupos,
  onErro,
}: {
  secao: SecaoOpcoes
  produtoId: string
  quantosGrupos: number
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [apagando, apagar] = useTransition()

  function excluir() {
    if (
      !confirm(
        `Apagar a seção "${secao.nome}"? Os grupos dela continuam existindo, só perdem o limite de conjunto.`
      )
    )
      return
    apagar(async () => {
      const resposta = await excluirSecaoAction(secao.id, produtoId)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  const regra =
    secao.min_escolhas === secao.max_escolhas
      ? `escolhe ${secao.max_escolhas} no total`
      : secao.min_escolhas > 0
        ? `escolhe de ${secao.min_escolhas} a ${secao.max_escolhas} no total`
        : `até ${secao.max_escolhas} no total`

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-tinta-300 bg-tinta-50 px-4 py-2.5">
      <p className="min-w-0 text-sm text-tinta-700">
        <span className="font-semibold text-tinta-900">Seção {secao.nome}</span> · {regra} ·{' '}
        {quantosGrupos} grupo{quantosGrupos === 1 ? '' : 's'}
      </p>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditando(true)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
        >
          editar
        </button>
        <button
          onClick={excluir}
          disabled={apagando}
          className="toque rounded-lg text-tinta-500 hover:bg-marca-50 hover:text-marca-600"
          aria-label={`Apagar seção ${secao.nome}`}
        >
          {apagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {editando && (
        <FormularioSecao
          produtoId={produtoId}
          secao={secao}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function FormularioSecao({
  produtoId,
  secao,
  onFechar,
  onSalvo,
}: {
  produtoId: string
  secao: SecaoOpcoes | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState(secao?.nome ?? '')
  const [min, setMin] = useState(String(secao?.min_escolhas ?? 1))
  const [max, setMax] = useState(String(secao?.max_escolhas ?? 2))

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    salvar(async () => {
      const resposta = await salvarSecaoAction({
        id: secao?.id,
        produto_id: produtoId,
        nome,
        min_escolhas: min,
        max_escolhas: max,
      })
      if (!resposta.ok) setErro(resposta.erro)
      else onSalvo()
    })
  }

  return (
    <ModalSimples titulo={secao ? 'Editar seção' : 'Nova seção'} onFechar={onFechar}>
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <Rotulo htmlFor="secao-nome">Nome da seção</Rotulo>
          <Campo
            id="secao-nome"
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Churrasco"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Rotulo htmlFor="secao-min">Mínimo no total</Rotulo>
            <Campo
              id="secao-min"
              type="number"
              min={0}
              max={20}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="secao-max">Máximo no total</Rotulo>
            <Campo
              id="secao-max"
              type="number"
              min={1}
              max={20}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-tinta-400">
          O limite vale para a SOMA dos grupos da seção. Ex.: Churrasco com mínimo 1 e máximo 2 —
          o cliente escolhe 1 ou 2 carnes, contando todos os tipos juntos. Depois, edite cada
          grupo e marque a seção dele.
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

function BlocoGrupo({
  grupo,
  produtoId,
  secoes,
  onErro,
  aoIniciarArrasto,
  aoTerminarArrasto,
  aoMover,
  podeSubir,
  podeDescer,
  reordenando,
}: {
  grupo: GrupoOpcoes
  produtoId: string
  secoes: SecaoOpcoes[]
  onErro: (mensagem: string) => void
  aoIniciarArrasto: () => void
  aoTerminarArrasto: () => void
  aoMover: (direcao: -1 | 1) => void
  podeSubir: boolean
  podeDescer: boolean
  reordenando: boolean
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
    (grupo.min_escolhas === 0
      ? `Opcional · até ${grupo.max_escolhas}`
      : grupo.min_escolhas === grupo.max_escolhas
        ? `Obrigatório · escolhe ${grupo.min_escolhas}`
        : `Obrigatório · de ${grupo.min_escolhas} a ${grupo.max_escolhas}`) +
    (grupo.permite_repetir ? ' · pode repetir' : '')

  const nomeSecao = grupo.secao_id
    ? secoes.find((s) => s.id === grupo.secao_id)?.nome
    : undefined

  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              // sem setData o Firefox nem inicia o arrasto
              e.dataTransfer.setData('text/plain', grupo.id)
              e.dataTransfer.effectAllowed = 'move'
              aoIniciarArrasto()
            }}
            onDragEnd={aoTerminarArrasto}
            className="mt-0.5 shrink-0 cursor-grab rounded p-1 text-tinta-300 hover:bg-tinta-100 hover:text-tinta-500 active:cursor-grabbing"
            aria-label={`Arrastar o grupo ${grupo.nome} para reordenar`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h3 className="font-semibold text-tinta-900">{grupo.nome}</h3>
            <p className="text-xs text-tinta-500">
              {regra}
              {nomeSecao && (
                <>
                  {' · '}
                  <span className="font-semibold text-amber-700">Seção {nomeSecao}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* setas cobrem o toque no celular, onde arrastar não existe */}
          <button
            onClick={() => aoMover(-1)}
            disabled={!podeSubir || reordenando}
            className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700 disabled:opacity-30"
            aria-label={`Mover o grupo ${grupo.nome} para cima`}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => aoMover(1)}
            disabled={!podeDescer || reordenando}
            className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700 disabled:opacity-30"
            aria-label={`Mover o grupo ${grupo.nome} para baixo`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditando(true)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
          >
            editar
          </button>
          <button
            onClick={excluir}
            disabled={apagando}
            className="toque rounded-lg text-tinta-500 hover:bg-marca-50 hover:text-marca-600"
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
          secoes={secoes}
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
          className="toque rounded text-tinta-400 hover:text-marca-600"
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
  secoes,
  onFechar,
  onSalvo,
}: {
  produtoId: string
  grupo: GrupoOpcoes | null
  secoes: SecaoOpcoes[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [min, setMin] = useState(String(grupo?.min_escolhas ?? 0))
  const [max, setMax] = useState(String(grupo?.max_escolhas ?? 1))
  const [ordem, setOrdem] = useState(String(grupo?.ordem ?? 0))
  const [secaoId, setSecaoId] = useState(grupo?.secao_id ?? '')
  const [permiteRepetir, setPermiteRepetir] = useState(grupo?.permite_repetir ?? false)

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
        secao_id: secaoId || null,
        permite_repetir: permiteRepetir,
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

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={permiteRepetir}
            onChange={(e) => setPermiteRepetir(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-black"
          />
          <span className="text-sm text-tinta-700">
            Pode repetir a mesma opção (2x, 3x...)
            <span className="block text-xs text-tinta-400">
              Para adicionais: o cliente escolhe a quantidade de cada um, e o máximo do grupo
              conta as repetições.
            </span>
          </span>
        </label>

        {secoes.length > 0 && (
          <div>
            <Rotulo htmlFor="grupo-secao">Faz parte de uma seção?</Rotulo>
            <Selecao
              id="grupo-secao"
              value={secaoId}
              onChange={(e) => setSecaoId(e.target.value)}
            >
              <option value="">Nenhuma — grupo solto</option>
              {secoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Selecao>
            <p className="mt-1 text-xs text-tinta-400">
              Dentro da seção, o limite dela vale para a soma de todos os grupos.
            </p>
          </div>
        )}

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
            className="h-5 w-5 accent-black"
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
