'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { useCarrinho } from '@/components/carrinho-contexto'
import { moeda } from '@/lib/format'

export function BotaoCarrinho() {
  const { quantidadeTotal, subtotalCentavos } = useCarrinho()

  return (
    <Link
      href="/carrinho"
      className="relative flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
      aria-label={`Carrinho com ${quantidadeTotal} ${quantidadeTotal === 1 ? 'item' : 'itens'}`}
    >
      <ShoppingBag className="h-5 w-5" />
      {quantidadeTotal > 0 ? (
        <>
          <span className="tabular-nums">{moeda(subtotalCentavos)}</span>
          <span className="bg-marca absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white">
            {quantidadeTotal}
          </span>
        </>
      ) : (
        <span className="hidden sm:inline">Carrinho</span>
      )}
    </Link>
  )
}
