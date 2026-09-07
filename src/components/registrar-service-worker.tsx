'use client'

import { useEffect } from 'react'

/**
 * Liga o service worker (public/sw.js).
 *
 * É ele que recebe os avisos de status do pedido e mostra a tela de "sem
 * conexão" quando o sinal cai. Sem isto registrado, o Chrome também não
 * oferece o "adicionar à tela de início" no Android — o convite do
 * DicaInstalar depende do evento que só existe com service worker no ar.
 *
 * Não recarrega a página quando entra uma versão nova de propósito: o cliente
 * pode estar no meio do checkout, e nenhuma melhoria vale um pedido perdido.
 * Como HTML nunca é guardado em cache, a versão nova entra na próxima visita
 * sem ninguém precisar fazer nada.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function registrar() {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((erro) => console.warn('[pwa] service worker não registrou', erro))
    }

    // depois do load: registro não pode disputar banda com o primeiro desenho da tela
    if (document.readyState === 'complete') {
      registrar()
      return
    }

    window.addEventListener('load', registrar)
    return () => window.removeEventListener('load', registrar)
  }, [])

  return null
}
