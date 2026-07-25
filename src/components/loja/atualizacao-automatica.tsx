'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Recarrega os dados da página de tempos em tempos.
 * Usado no acompanhamento do pedido e no painel da cozinha — assim o cliente vê
 * o "pronto para retirada" sem apertar F5.
 */
export function AtualizacaoAutomatica({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter()

  useEffect(() => {
    const intervalo = setInterval(() => {
      // não gasta requisição com a aba em segundo plano
      if (document.visibilityState === 'visible') router.refresh()
    }, segundos * 1000)

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [router, segundos])

  return null
}
