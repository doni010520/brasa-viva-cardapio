'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

/**
 * Abre a caixa de impressão sozinha ao carregar a comanda e deixa um botão
 * para reimprimir — a bobina engasga, e reimprimir é rotina no balcão.
 * A barra some na impressão (classe `sem-impressao`).
 */
export function ImpressaoAutomatica({ codigo }: { codigo: string }) {
  useEffect(() => {
    const disparo = setTimeout(() => window.print(), 300)
    return () => clearTimeout(disparo)
  }, [])

  return (
    <div className="sem-impressao mb-4 flex items-center justify-between gap-2 border-b border-dashed border-black/30 pb-3">
      <span className="text-[11px] text-black/60">Comanda #{codigo}</span>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded bg-black px-2.5 py-1.5 text-[11px] font-semibold text-white"
      >
        <Printer className="h-3.5 w-3.5" />
        Imprimir
      </button>
    </div>
  )
}
