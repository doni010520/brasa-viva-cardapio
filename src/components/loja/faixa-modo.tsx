'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, Repeat, Store, UtensilsCrossed } from 'lucide-react'
import { useCarrinho } from '@/components/carrinho-contexto'
import { escolherModoAction } from '@/app/(loja)/acoes-modo'
import type { ModoConsumo } from '@/lib/types'

/**
 * Faixa que diz, o tempo todo, onde a pessoa vai comer.
 *
 * Antes a diferença entre "no salão" e "vou levar" era um botãozinho só no
 * cardápio — e as duas telas ficavam quase idênticas. Alguém no salão podia
 * fechar um pedido de entrega sem perceber. Agora a faixa acompanha o cliente
 * em todas as telas, com cor e ícone próprios: verde para o salão, roxo para
 * levar. Cor + ícone + texto, para não depender só da cor.
 */

/**
 * Vermelho da marca para o salão, amarelo para levar.
 *
 * O amarelo pede texto escuro: letra branca sobre amarelo não tem contraste
 * suficiente para ler no sol, e o cliente do salão vai estar com o celular
 * na mão perto da janela.
 */
const APARENCIA = {
  local: {
    fundo: 'bg-marca text-white',
    botao: 'bg-white/20 hover:bg-white/30 text-white',
    apoio: 'text-white/80',
    icone: UtensilsCrossed,
    titulo: 'Você está no restaurante',
    detalhe: 'Buffet e bebidas, servidos no salão',
  },
  viagem: {
    fundo: 'bg-amber-400 text-carvao-900',
    botao: 'bg-carvao-900/10 hover:bg-carvao-900/20 text-carvao-900',
    apoio: 'text-carvao-900/70',
    icone: Bike,
    titulo: 'Pedido para levar',
    detalhe: 'Entrega ou retirada no balcão',
  },
} as const

export function FaixaModo({ modo, mesa }: { modo: ModoConsumo; mesa: string | null }) {
  const router = useRouter()
  const { quantidadeTotal, limpar } = useCarrinho()
  const [trocando, trocar] = useTransition()

  const { fundo, botao, apoio, icone: Icone, titulo, detalhe } = APARENCIA[modo]

  function alternar() {
    const novo: ModoConsumo = modo === 'local' ? 'viagem' : 'local'

    if (quantidadeTotal > 0) {
      const texto =
        novo === 'local'
          ? 'Mudar para "estou no restaurante" esvazia seu carrinho, porque o cardápio é outro. Continuar?'
          : 'Mudar para "vou levar" esvazia seu carrinho, porque o cardápio é outro. Continuar?'
      if (!confirm(texto)) return
      limpar()
    }

    trocar(async () => {
      await escolherModoAction(novo)
      router.refresh()
    })
  }

  return (
    <div className={fundo}>
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <Icone className="h-6 w-6 shrink-0" strokeWidth={2.5} />

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-bold">
            {titulo}
            {mesa && (
              <span className="ml-2 rounded bg-carvao-900/20 px-1.5 py-0.5 text-xs">
                Mesa {mesa}
              </span>
            )}
          </p>
          <p className={`truncate text-xs ${apoio}`}>{detalhe}</p>
        </div>

        <button
          onClick={alternar}
          disabled={trocando}
          className={`toque shrink-0 gap-1.5 rounded-lg px-3 text-xs font-bold transition disabled:opacity-60 ${botao}`}
        >
          {trocando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Repeat className="h-3.5 w-3.5" />
          )}
          Trocar
        </button>
      </div>
    </div>
  )
}

/** Versão compacta e estática, para o cabeçalho da tela de fechamento. */
export function SeloModo({ modo, mesa }: { modo: ModoConsumo; mesa: string | null }) {
  const { fundo, icone: Icone, titulo } = APARENCIA[modo]

  return (
    <span
      className={`${fundo} inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold`}
    >
      {modo === 'local' ? <Icone className="h-4 w-4" /> : <Store className="h-4 w-4" />}
      {titulo}
      {mesa && <span className="rounded bg-carvao-900/20 px-1.5 text-xs">Mesa {mesa}</span>}
    </span>
  )
}
