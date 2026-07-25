'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { useCarrinho } from '@/components/carrinho-contexto'
import { moeda } from '@/lib/format'

/** Barra fixa no rodapé com o resumo do carrinho. Some nas telas de fechamento. */
export function BarraCarrinho() {
  const { quantidadeTotal, subtotalCentavos } = useCarrinho()
  const rota = usePathname()

  if (quantidadeTotal === 0) return null
  if (rota.startsWith('/carrinho') || rota.startsWith('/checkout')) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta-200 bg-white/95 p-3 backdrop-blur">
      <Link
        href="/carrinho"
        className="bg-marca mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          Ver carrinho
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-white/25 px-2 py-0.5 tabular-nums">
            {quantidadeTotal}
          </span>
          <span className="tabular-nums">{moeda(subtotalCentavos)}</span>
        </span>
      </Link>
    </div>
  )
}
