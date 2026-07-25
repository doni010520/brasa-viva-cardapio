'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, UtensilsCrossed } from 'lucide-react'
import { useCarrinho } from '@/components/carrinho-contexto'
import { escolherModoAction } from '@/app/(loja)/acoes-modo'
import type { ModoConsumo } from '@/lib/types'

/**
 * Troca entre "estou no restaurante" e "vou levar".
 *
 * O carrinho é esvaziado na troca de propósito: o buffet livre não pode ir
 * para viagem, e a marmita embalada não faz sentido no salão. Melhor perder
 * dois cliques do que deixar um item impossível passar para o checkout.
 */
export function TrocarModo({ modo }: { modo: ModoConsumo }) {
  const router = useRouter()
  const { quantidadeTotal, limpar } = useCarrinho()
  const [trocando, trocar] = useTransition()

  function alternar(novo: ModoConsumo) {
    if (novo === modo) return

    if (quantidadeTotal > 0) {
      const texto =
        novo === 'local'
          ? 'Mudar para "no restaurante" vai esvaziar seu carrinho, porque o cardápio é outro. Continuar?'
          : 'Mudar para "vou levar" vai esvaziar seu carrinho, porque o cardápio é outro. Continuar?'
      if (!confirm(texto)) return
      limpar()
    }

    trocar(async () => {
      await escolherModoAction(novo)
      router.refresh()
    })
  }

  return (
    <div className="flex gap-1 rounded-xl bg-tinta-200/70 p-1">
      <Aba
        ativa={modo === 'local'}
        onClick={() => alternar('local')}
        carregando={trocando}
        icone={<UtensilsCrossed className="h-4 w-4" />}
        rotulo="No restaurante"
      />
      <Aba
        ativa={modo === 'viagem'}
        onClick={() => alternar('viagem')}
        carregando={trocando}
        icone={<Bike className="h-4 w-4" />}
        rotulo="Vou levar"
      />
    </div>
  )
}

function Aba({
  ativa,
  onClick,
  carregando,
  icone,
  rotulo,
}: {
  ativa: boolean
  onClick: () => void
  carregando: boolean
  icone: React.ReactNode
  rotulo: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={carregando}
      aria-pressed={ativa}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        ativa ? 'bg-white text-tinta-900 shadow-sm' : 'text-tinta-600 hover:text-tinta-900'
      }`}
    >
      {carregando && !ativa ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
      {rotulo}
    </button>
  )
}
