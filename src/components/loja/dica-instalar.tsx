'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { Botao, Cartao } from '@/components/ui'

const CHAVE = 'cardapio:dica-instalar-dispensada'

type PromptDeInstalacao = Event & { prompt: () => Promise<void> }

/**
 * Convida a colocar o site na tela de início.
 *
 * Não é enfeite: no iPhone, o Safari joga fora cookie e storage de site que a
 * pessoa não abre há alguns dias — e junto vai a sessão. Instalado na tela de
 * início, o site ganha armazenamento próprio e o cliente continua logado.
 *
 * Só aparece para quem já entrou (é quem tem o que perder) e some para sempre
 * se a pessoa fechar.
 */
export function DicaInstalar() {
  const [mostrar, setMostrar] = useState(false)
  const [ehIOS, setEhIOS] = useState(false)
  const [prompt, setPrompt] = useState<PromptDeInstalacao | null>(null)

  useEffect(() => {
    // já instalado? então não há o que sugerir
    const instalado =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    if (instalado || localStorage.getItem(CHAVE)) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setEhIOS(ios)

    // No iPhone não existe botão de instalar: o caminho é o menu Compartilhar,
    // então a única saída é explicar. No Android o navegador avisa quando pode.
    if (ios) {
      setMostrar(true)
      return
    }

    function aoPoderInstalar(evento: Event) {
      evento.preventDefault()
      setPrompt(evento as PromptDeInstalacao)
      setMostrar(true)
    }

    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    return () => window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
  }, [])

  if (!mostrar) return null

  function dispensar() {
    localStorage.setItem(CHAVE, '1')
    setMostrar(false)
  }

  return (
    <Cartao className="relative mt-6 p-4">
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="absolute top-3 right-3 text-tinta-300 hover:text-tinta-600"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="pr-6 font-bold text-tinta-900">Deixe na tela do celular</h2>
      <p className="mt-1 text-sm text-tinta-500">
        {ehIOS
          ? 'Assim vira um ícone como qualquer app — e você continua conectado, sem precisar entrar de novo.'
          : 'Vira um ícone como qualquer app, abre mais rápido e você continua conectado.'}
      </p>

      {ehIOS ? (
        <ol className="mt-3 space-y-1.5 text-sm text-tinta-600">
          <li className="flex items-center gap-2">
            <Share className="h-4 w-4 shrink-0 text-tinta-400" />
            Toque no botão Compartilhar, aqui embaixo
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus className="h-4 w-4 shrink-0 text-tinta-400" />
            Escolha &ldquo;Adicionar à Tela de Início&rdquo;
          </li>
        </ol>
      ) : (
        <Botao
          className="mt-3 h-11"
          onClick={async () => {
            await prompt?.prompt()
            dispensar()
          }}
        >
          Adicionar à tela de início
        </Botao>
      )}
    </Cartao>
  )
}
