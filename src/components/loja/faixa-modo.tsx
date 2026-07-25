'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, Store, UtensilsCrossed } from 'lucide-react'
import { useCarrinho } from '@/components/carrinho-contexto'
import { escolherModoAction } from '@/app/(loja)/acoes-modo'
import type { ModoConsumo } from '@/lib/types'

/**
 * Faixa que diz, o tempo todo, onde a pessoa vai comer.
 *
 * Antes a diferença entre "no salão" e "vou levar" era um botãozinho só no
 * cardápio, e as duas telas ficavam quase idênticas — alguém sentado no salão
 * podia fechar um pedido de entrega sem perceber. Agora a faixa acompanha o
 * cliente em todas as telas até o checkout.
 *
 * Quatro decisões deste arquivo:
 *
 * 1. Cor + ícone + texto, nunca só a cor: vermelho da marca no salão, amarelo
 *    para levar. Quem não distingue cor continua entendendo.
 *
 * 2. O amarelo usa texto escuro. Letra branca sobre amarelo não tem contraste
 *    para ler no sol, e o cliente do salão está com o celular perto da janela.
 *
 * 3. O botão nomeia o DESTINO, não a ação. "Trocar" descreve o mecanismo e
 *    deixa a pessoa adivinhar onde vai parar; "É para viagem" já diz o resultado.
 *
 * 4. A palavra é "salão", nunca "aqui" nem "no restaurante". "Você está no
 *    restaurante" era lido de casa como "você está no site do restaurante";
 *    "vou comer aqui" também serve para quem vai comer em casa. Ninguém tem
 *    salão em casa, então a palavra resolve sozinha.
 */
const APARENCIA = {
  local: {
    fundo: 'bg-marca text-white',
    botao: 'bg-white/20 hover:bg-white/30 text-white',
    apoio: 'text-white/80',
    icone: UtensilsCrossed,
    titulo: 'Pedido no salão',
    detalhe: 'Servido na sua mesa, no restaurante',
    // para onde o botão leva
    destino: 'É para viagem',
    iconeDestino: Bike,
  },
  viagem: {
    fundo: 'bg-amber-400 text-carvao-900',
    botao: 'bg-carvao-900/10 hover:bg-carvao-900/20 text-carvao-900',
    apoio: 'text-carvao-900/70',
    icone: Bike,
    titulo: 'Pedido para viagem',
    detalhe: 'Entrega em casa ou retirada no balcão',
    destino: 'Estou no salão',
    iconeDestino: UtensilsCrossed,
  },
} as const

export function FaixaModo({ modo, mesa }: { modo: ModoConsumo; mesa: string | null }) {
  const router = useRouter()
  const { quantidadeTotal, limpar } = useCarrinho()
  const [trocando, trocar] = useTransition()

  const {
    fundo,
    botao,
    apoio,
    icone: Icone,
    titulo,
    detalhe,
    destino,
    iconeDestino: IconeDestino,
  } = APARENCIA[modo]

  function alternar() {
    const novo: ModoConsumo = modo === 'local' ? 'viagem' : 'local'

    if (quantidadeTotal > 0) {
      const texto =
        novo === 'local'
          ? 'Mudar para "pedido no salão" esvazia seu carrinho, porque o cardápio é outro. Continuar?'
          : 'Mudar para "pedido para viagem" esvazia seu carrinho, porque o cardápio é outro. Continuar?'
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
          aria-label={`Mudar para: ${destino}`}
          className={`toque shrink-0 gap-1.5 rounded-lg px-3 text-xs font-bold transition disabled:opacity-60 ${botao}`}
        >
          {trocando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <IconeDestino className="h-4 w-4" />
          )}
          {destino}
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
