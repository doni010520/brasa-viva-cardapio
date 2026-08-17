'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { extraDaOpcao } from '@/lib/types'
import type { ItemCarrinho, OpcaoEscolhida } from '@/lib/types'

const CHAVE = 'cardapio:carrinho:v1'

export type EntradaCarrinho = Omit<ItemCarrinho, 'linhaId'>

type CarrinhoContexto = {
  itens: ItemCarrinho[]
  carregado: boolean
  quantidadeTotal: number
  subtotalCentavos: number
  adicionar: (item: EntradaCarrinho) => void
  alterarQuantidade: (linhaId: string, quantidade: number) => void
  remover: (linhaId: string) => void
  limpar: () => void
}

const Contexto = createContext<CarrinhoContexto | null>(null)

/** Duas linhas com o mesmo produto, mesmas opções (e quantidades) e mesma observação se juntam. */
function chaveDaLinha(item: EntradaCarrinho) {
  const opcoes = [...item.opcoes]
    .map((o) => `${o.grupo}:${o.nome}x${o.quantidade ?? 1}`)
    .sort()
    .join('|')
  return `${item.produtoId}::${opcoes}::${item.observacao.trim().toLowerCase()}`
}

export function precoDaLinha(item: Pick<ItemCarrinho, 'precoBaseCentavos' | 'opcoes'>) {
  return (
    item.precoBaseCentavos +
    item.opcoes.reduce((soma: number, o: OpcaoEscolhida) => soma + extraDaOpcao(o), 0)
  )
}

export function ProvedorCarrinho({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (bruto) setItens(JSON.parse(bruto) as ItemCarrinho[])
    } catch {
      // carrinho corrompido: começa vazio em vez de quebrar a loja
      localStorage.removeItem(CHAVE)
    }
    setCarregado(true)
  }, [])

  useEffect(() => {
    if (!carregado) return
    localStorage.setItem(CHAVE, JSON.stringify(itens))
  }, [itens, carregado])

  const adicionar = useCallback((entrada: EntradaCarrinho) => {
    const linhaId = chaveDaLinha(entrada)
    setItens((atuais) => {
      const existente = atuais.find((i) => i.linhaId === linhaId)
      if (existente) {
        return atuais.map((i) =>
          i.linhaId === linhaId ? { ...i, quantidade: i.quantidade + entrada.quantidade } : i
        )
      }
      return [...atuais, { ...entrada, linhaId }]
    })
  }, [])

  const alterarQuantidade = useCallback((linhaId: string, quantidade: number) => {
    setItens((atuais) =>
      quantidade <= 0
        ? atuais.filter((i) => i.linhaId !== linhaId)
        : atuais.map((i) => (i.linhaId === linhaId ? { ...i, quantidade } : i))
    )
  }, [])

  const remover = useCallback((linhaId: string) => {
    setItens((atuais) => atuais.filter((i) => i.linhaId !== linhaId))
  }, [])

  const limpar = useCallback(() => setItens([]), [])

  const valor = useMemo<CarrinhoContexto>(
    () => ({
      itens,
      carregado,
      quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
      subtotalCentavos: itens.reduce((s, i) => s + precoDaLinha(i) * i.quantidade, 0),
      adicionar,
      alterarQuantidade,
      remover,
      limpar,
    }),
    [itens, carregado, adicionar, alterarQuantidade, remover, limpar]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCarrinho() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de <ProvedorCarrinho>')
  return contexto
}
