'use client'

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useCarrinho, type EntradaCarrinho } from '@/components/carrinho-contexto'
import { AreaTexto, Botao } from '@/components/ui'
import { moeda } from '@/lib/format'
import { extraDaOpcao } from '@/lib/types'
import type { GrupoOpcoes, OpcaoEscolhida, Produto, SecaoOpcoes } from '@/lib/types'

export function ModalProduto({
  produto,
  lojaAberta,
  onFechar,
  aoConfirmar,
}: {
  produto: Produto
  lojaAberta: boolean
  onFechar: () => void
  /**
   * Quem recebe o item montado. Sem isso, vai para o carrinho do site.
   * O balcão do painel passa a própria função: mesmo modal, mesmas regras
   * de opções, mas o item vai para o lançamento da atendente.
   */
  aoConfirmar?: (item: EntradaCarrinho) => void
}) {
  const carrinho = useCarrinho()
  const [quantidade, setQuantidade] = useState(1)
  const [observacao, setObservacao] = useState('')
  // grupo_id -> ids das opções marcadas
  const [escolhas, setEscolhas] = useState<Record<string, string[]>>({})

  const grupos = useMemo(() => produto.grupos_opcoes ?? [], [produto])
  const secoes = useMemo(() => produto.secoes_opcoes ?? [], [produto])

  const precoBase =
    produto.preco_promo_centavos !== null && produto.preco_promo_centavos < produto.preco_centavos
      ? produto.preco_promo_centavos
      : produto.preco_centavos

  // Pré-seleciona a 1ª opção dos grupos obrigatórios de escolha única
  useEffect(() => {
    const inicial: Record<string, string[]> = {}
    for (const grupo of grupos) {
      if (grupo.min_escolhas >= 1 && grupo.max_escolhas === 1) {
        const primeira = grupo.opcoes.find((o) => o.disponivel)
        if (primeira) inicial[grupo.id] = [primeira.id]
      }
    }
    setEscolhas(inicial)
  }, [grupos])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', aoTeclar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = ''
    }
  }, [onFechar])

  const selecionadas: OpcaoEscolhida[] = useMemo(() => {
    const lista: OpcaoEscolhida[] = []
    for (const grupo of grupos) {
      const marcadas = escolhas[grupo.id] ?? []
      // id repetido na lista = quantidade ("3x Fraldinha")
      for (const id of [...new Set(marcadas)]) {
        const opcao = grupo.opcoes.find((o) => o.id === id)
        if (!opcao) continue
        const vezes = marcadas.filter((m) => m === id).length
        lista.push({
          id: opcao.id,
          grupo: grupo.nome,
          nome: opcao.nome,
          preco_extra_centavos: opcao.preco_extra_centavos,
          ...(vezes > 1 ? { quantidade: vezes } : {}),
        })
      }
    }
    return lista
  }, [grupos, escolhas])

  const extras = selecionadas.reduce((s, o) => s + extraDaOpcao(o), 0)
  const total = (precoBase + extras) * quantidade

  /** Total escolhido no conjunto de grupos de uma seção. */
  function totalDaSecao(secaoId: string) {
    return grupos
      .filter((g) => g.secao_id === secaoId)
      .reduce((soma, g) => soma + (escolhas[g.id]?.length ?? 0), 0)
  }

  // O que ainda falta escolher: mínimos de cada grupo e mínimos das seções
  const nomesPendentes = [
    ...grupos
      .filter((g) => g.min_escolhas > 0 && (escolhas[g.id]?.length ?? 0) < g.min_escolhas)
      .map((g) => g.nome),
    ...secoes.filter((s) => totalDaSecao(s.id) < s.min_escolhas).map((s) => s.nome),
  ]
  const podeAdicionar = nomesPendentes.length === 0 && lojaAberta && produto.disponivel

  // Ordem de exibição: a seção aparece inteira na posição do primeiro grupo dela
  const blocos = useMemo(() => {
    const resultado: ({ secao: SecaoOpcoes; grupos: GrupoOpcoes[] } | { grupo: GrupoOpcoes })[] = []
    const secoesVistas = new Set<string>()
    for (const grupo of grupos) {
      const secao = grupo.secao_id ? secoes.find((s) => s.id === grupo.secao_id) : undefined
      if (!secao) {
        resultado.push({ grupo })
        continue
      }
      if (secoesVistas.has(secao.id)) continue
      secoesVistas.add(secao.id)
      resultado.push({ secao, grupos: grupos.filter((g) => g.secao_id === secao.id) })
    }
    return resultado
  }, [grupos, secoes])

  function alternar(grupoId: string, opcaoId: string, maximo: number, minimo: number) {
    setEscolhas((atuais) => {
      const marcadas = atuais[grupoId] ?? []
      if (maximo === 1) {
        // escolha única: no grupo opcional, clicar de novo DESMARCA — sem isso
        // quem marca a farofa sem querer fica preso com ela até fechar o modal
        if (minimo === 0 && marcadas.includes(opcaoId)) return { ...atuais, [grupoId]: [] }
        return { ...atuais, [grupoId]: [opcaoId] }
      }
      if (marcadas.includes(opcaoId)) {
        return { ...atuais, [grupoId]: marcadas.filter((id) => id !== opcaoId) }
      }
      if (marcadas.length >= maximo) return atuais // já bateu o limite do grupo
      return { ...atuais, [grupoId]: [...marcadas, opcaoId] }
    })
  }

  /** Grupos com "pode repetir": soma ou tira UMA unidade da opção. */
  function mudarQuantidade(grupoId: string, opcaoId: string, delta: 1 | -1, maximo: number) {
    setEscolhas((atuais) => {
      const marcadas = atuais[grupoId] ?? []
      if (delta > 0) {
        if (marcadas.length >= maximo) return atuais
        return { ...atuais, [grupoId]: [...marcadas, opcaoId] }
      }
      const posicao = marcadas.indexOf(opcaoId)
      if (posicao < 0) return atuais
      const novas = [...marcadas]
      novas.splice(posicao, 1)
      return { ...atuais, [grupoId]: novas }
    })
  }

  function confirmar() {
    if (!podeAdicionar) return
    const item = {
      produtoId: produto.id,
      nome: produto.nome,
      imagemUrl: produto.imagem_url,
      precoBaseCentavos: precoBase,
      opcoes: selecionadas,
      observacao,
      quantidade,
    }
    if (aoConfirmar) aoConfirmar(item)
    else carrinho.adicionar(item)
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={produto.nome}
    >
      <div
        className="anima-entrada flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0">
          {produto.imagem_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={produto.imagem_url}
              alt={produto.nome}
              className="h-44 w-full rounded-t-3xl object-cover"
            />
          )}
          <button
            onClick={onFechar}
            className="absolute top-3 right-3 rounded-full bg-white p-2 text-tinta-700 shadow-md"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-xl font-bold text-tinta-900">{produto.nome}</h2>
          {produto.descricao && <p className="mt-1 text-tinta-500">{produto.descricao}</p>}
          <p className="mt-2 font-bold text-tinta-900">{moeda(precoBase)}</p>

          {blocos.map((bloco) =>
            'secao' in bloco ? (
              <section key={bloco.secao.id} className="mt-5 rounded-2xl border border-tinta-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-tinta-900">{bloco.secao.nome}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      totalDaSecao(bloco.secao.id) < bloco.secao.min_escolhas
                        ? 'bg-marca-50 text-marca-700'
                        : 'bg-tinta-100 text-tinta-500'
                    }`}
                  >
                    {totalDaSecao(bloco.secao.id) < bloco.secao.min_escolhas
                      ? bloco.secao.min_escolhas === bloco.secao.max_escolhas
                        ? `Escolha ${bloco.secao.max_escolhas}`
                        : `Escolha ${bloco.secao.min_escolhas} a ${bloco.secao.max_escolhas}`
                      : `${totalDaSecao(bloco.secao.id)} de ${bloco.secao.max_escolhas}`}
                  </span>
                </div>
                {bloco.grupos.map((grupo) => (
                  <CampoDoGrupo
                    key={grupo.id}
                    grupo={grupo}
                    secao={bloco.secao}
                    totalNaSecao={totalDaSecao(bloco.secao.id)}
                    marcadas={escolhas[grupo.id] ?? []}
                    aoAlternar={alternar}
                    aoMudarQuantidade={mudarQuantidade}
                  />
                ))}
              </section>
            ) : (
              <CampoDoGrupo
                key={bloco.grupo.id}
                grupo={bloco.grupo}
                marcadas={escolhas[bloco.grupo.id] ?? []}
                aoAlternar={alternar}
                aoMudarQuantidade={mudarQuantidade}
              />
            )
          )}

          <div className="mt-5">
            <label className="mb-1.5 block font-semibold text-tinta-900" htmlFor="obs">
              Alguma observação?
            </label>
            <AreaTexto
              id="obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: sem cebola, capricha na farofa..."
              maxLength={200}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-tinta-200 p-4">
          {nomesPendentes.length > 0 && (
            <p className="mb-2 text-center text-xs font-medium text-marca-600">
              Escolha: {nomesPendentes.join(', ')}
            </p>
          )}
          {!lojaAberta && (
            <p className="mb-2 text-center text-xs font-medium text-amber-700">
              A loja está fechada agora.
            </p>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-tinta-200 p-1">
              <button
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                className="rounded-lg p-2 text-tinta-600 hover:bg-tinta-100 disabled:opacity-40"
                disabled={quantidade <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-7 text-center font-bold tabular-nums">{quantidade}</span>
              <button
                onClick={() => setQuantidade((q) => Math.min(99, q + 1))}
                className="rounded-lg p-2 text-tinta-600 hover:bg-tinta-100"
                aria-label="Aumentar quantidade"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <Botao onClick={confirmar} disabled={!podeAdicionar} className="h-11 flex-1">
              Adicionar {moeda(total)}
            </Botao>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Um grupo de opções. Dentro de seção, respeita também o limite do conjunto. */
function CampoDoGrupo({
  grupo,
  secao,
  totalNaSecao = 0,
  marcadas,
  aoAlternar,
  aoMudarQuantidade,
}: {
  grupo: GrupoOpcoes
  secao?: SecaoOpcoes
  totalNaSecao?: number
  marcadas: string[]
  aoAlternar: (grupoId: string, opcaoId: string, maximo: number, minimo: number) => void
  aoMudarQuantidade: (grupoId: string, opcaoId: string, delta: 1 | -1, maximo: number) => void
}) {
  const unica = grupo.max_escolhas === 1
  const obrigatorio = grupo.min_escolhas > 0
  const repetivel = grupo.permite_repetir && !unica
  const secaoCheia = Boolean(secao && totalNaSecao >= secao.max_escolhas)

  return (
    <fieldset className={secao ? 'mt-3' : 'mt-5'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="font-semibold text-tinta-900">{grupo.nome}</legend>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            obrigatorio && marcadas.length < grupo.min_escolhas
              ? 'bg-marca-50 text-marca-700'
              : 'bg-tinta-100 text-tinta-500'
          }`}
        >
          {obrigatorio
            ? 'Obrigatório'
            : grupo.max_escolhas === 1
              ? 'Opcional'
              : repetivel
                ? `${marcadas.length} de ${grupo.max_escolhas}`
                : `Até ${grupo.max_escolhas}`}
        </span>
      </div>

      <div className="space-y-1.5">
        {grupo.opcoes.map((opcao) => {
          const vezes = marcadas.filter((id) => id === opcao.id).length
          const marcada = vezes > 0
          const grupoCheio = marcadas.length >= grupo.max_escolhas
          const limiteAtingido = !unica && !marcada && grupoCheio
          // Trocar dentro do mesmo grupo de escolha única não aumenta o total
          // da seção — então a seção cheia não trava a troca, só o acréscimo.
          const acrescentaria = !marcada && !(unica && marcadas.length === 1)
          const travadaPelaSecao = secaoCheia && acrescentaria
          const bloqueada = !opcao.disponivel || limiteAtingido || travadaPelaSecao

          // Grupo repetível: a linha vira um contador (−) 2x (+)
          if (repetivel) {
            const podeSomar = opcao.disponivel && !grupoCheio && !secaoCheia
            return (
              <div
                key={opcao.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                  marcada ? 'border-tinta-900 bg-tinta-50' : 'border-tinta-200'
                } ${!opcao.disponivel ? 'opacity-45' : ''}`}
              >
                <span className="flex-1 text-sm text-tinta-900">{opcao.nome}</span>
                {opcao.preco_extra_centavos > 0 && (
                  <span className="text-sm font-semibold text-tinta-600">
                    + {moeda(opcao.preco_extra_centavos)}
                  </span>
                )}
                {marcada ? (
                  <span className="flex items-center gap-1 rounded-lg border border-tinta-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => aoMudarQuantidade(grupo.id, opcao.id, -1, grupo.max_escolhas)}
                      className="rounded-md p-1.5 text-tinta-600 hover:bg-tinta-100"
                      aria-label={`Tirar uma unidade de ${opcao.nome}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-bold tabular-nums">
                      {vezes}x
                    </span>
                    <button
                      type="button"
                      onClick={() => aoMudarQuantidade(grupo.id, opcao.id, 1, grupo.max_escolhas)}
                      disabled={!podeSomar}
                      className="rounded-md p-1.5 text-tinta-600 hover:bg-tinta-100 disabled:opacity-30"
                      aria-label={`Somar uma unidade de ${opcao.nome}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => aoMudarQuantidade(grupo.id, opcao.id, 1, grupo.max_escolhas)}
                    disabled={!podeSomar}
                    className="rounded-lg border border-tinta-300 p-2 text-tinta-600 transition hover:border-tinta-400 hover:bg-tinta-50 disabled:opacity-30"
                    aria-label={`Adicionar ${opcao.nome}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          }

          return (
            <label
              key={opcao.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                marcada ? 'border-tinta-900 bg-tinta-50' : 'border-tinta-200'
              } ${bloqueada ? 'cursor-not-allowed opacity-45' : 'hover:border-tinta-300'}`}
            >
              <input
                // radio só quando não dá para ficar vazio: no grupo
                // opcional a bolinha mentiria que não tem como desmarcar
                type={unica && obrigatorio ? 'radio' : 'checkbox'}
                name={grupo.id}
                checked={marcada}
                disabled={bloqueada}
                onChange={() =>
                  aoAlternar(grupo.id, opcao.id, grupo.max_escolhas, grupo.min_escolhas)
                }
                className="h-5 w-5 accent-black"
              />
              <span className="flex-1 text-sm text-tinta-900">{opcao.nome}</span>
              {opcao.preco_extra_centavos > 0 && (
                <span className="text-sm font-semibold text-tinta-600">
                  + {moeda(opcao.preco_extra_centavos)}
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
