'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Botao } from '@/components/ui'

/**
 * A campanha do restaurante, em cima de tudo.
 *
 * Aparece na tela que o cliente vê depois de pagar — o único momento em que
 * ele está feliz, com o celular na mão e sem pressa. Aqui ela é modal e não
 * um cartão no meio da página porque, no cartão, muita gente rolava direto
 * para "acompanhar meu pedido" sem sequer ver o convite.
 *
 * Duas gentilezas que evitam que isso vire praga:
 *   - só aparece UMA VEZ por pedido (o navegador lembra qual já viu);
 *   - fechar é fácil e o convite continua na página, embaixo.
 */

const CHAVE = 'cardapio:campanha-vista'

/** Papel picado nas cores da marca. Posição e atraso fixos por índice —
 *  nada de sorteio, senão o servidor e o navegador desenham diferente. */
const PAPEIS = [
  { esquerda: '6%', atraso: '0s', cor: '#e30613', duracao: '2.4s' },
  { esquerda: '18%', atraso: '0.35s', cor: '#fbbf24', duracao: '2.9s' },
  { esquerda: '31%', atraso: '0.1s', cor: '#ffffff', duracao: '2.6s' },
  { esquerda: '44%', atraso: '0.6s', cor: '#e30613', duracao: '3.1s' },
  { esquerda: '57%', atraso: '0.2s', cor: '#fbbf24', duracao: '2.5s' },
  { esquerda: '69%', atraso: '0.5s', cor: '#ffffff', duracao: '3s' },
  { esquerda: '82%', atraso: '0.05s', cor: '#e30613', duracao: '2.7s' },
  { esquerda: '93%', atraso: '0.45s', cor: '#fbbf24', duracao: '2.8s' },
]

export function ModalCampanha({
  pedidoId,
  titulo,
  texto,
  emoji,
  rotuloBotao,
  instagramUrl,
  nomeLoja,
}: {
  pedidoId: string
  titulo: string
  texto: string | null
  emoji: string
  rotuloBotao: string
  instagramUrl: string
  nomeLoja: string
}) {
  const [aberto, setAberto] = useState(false)
  const fechar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let jaViu: string[] = []
    try {
      jaViu = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    } catch {
      jaViu = []
    }
    if (jaViu.includes(pedidoId)) return

    // Um respiro antes de abrir: deixa o "Pagamento confirmado" ser lido
    // primeiro. Aparecer junto vira uma coisa só e ninguém lê nenhuma das duas.
    const relogio = setTimeout(() => {
      setAberto(true)
      localStorage.setItem(CHAVE, JSON.stringify([pedidoId, ...jaViu].slice(0, 20)))
    }, 900)

    return () => clearTimeout(relogio)
  }, [pedidoId])

  // Trava a rolagem do fundo e liga o Esc enquanto está aberto.
  useEffect(() => {
    if (!aberto) return

    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fechar.current?.focus()

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('keydown', aoTeclar)

    return () => {
      document.body.style.overflow = anterior
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  if (!aberto) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="campanha-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Fundo escurecido: é ele que tira a página de cena e deixa só isto. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => setAberto(false)}
        className="anima-vela absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
      />

      <div className="anima-cartaz relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          ref={fechar}
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/15 text-white transition hover:bg-black/30"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-marca relative overflow-hidden px-6 pt-8 pb-7 text-center text-white">
          {/* papel picado caindo por cima da faixa vermelha */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {PAPEIS.map((papel, i) => (
              <span
                key={i}
                className="anima-papel absolute top-0 block h-2.5 w-1.5 rounded-[1px]"
                style={{
                  left: papel.esquerda,
                  backgroundColor: papel.cor,
                  animationDelay: papel.atraso,
                  animationDuration: papel.duracao,
                }}
              />
            ))}
          </div>

          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span
              aria-hidden
              className="anima-brasa absolute inset-0 rounded-full bg-white/30 blur-xl"
            />
            {/* tamanho fora da escala de propósito: `text-6xl` é a classe do
                número do pedido, e ter as duas na mesma tela deixava ambíguo
                quem lê a tela por classe (leitor de tela, teste, script) */}
            <span className="anima-bombom relative text-[3.75rem] leading-none">{emoji}</span>
          </div>

          <h2 id="campanha-titulo" className="relative mt-3 text-2xl font-black tracking-tight">
            {titulo}
          </h2>
        </div>

        <div className="p-6 text-center">
          {texto && <p className="text-tinta-600">{texto}</p>}

          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => setAberto(false)}
            className="mt-5 block"
          >
            <Botao className="h-13 w-full text-base">
              <Camera className="h-5 w-5" />
              {rotuloBotao}
            </Botao>
          </a>
          <p className="mt-2 text-xs text-tinta-400">Abre o Instagram da {nomeLoja}</p>

          <button
            type="button"
            onClick={() => setAberto(false)}
            className="mt-4 text-sm font-medium text-tinta-500 underline underline-offset-2 hover:text-tinta-900"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
