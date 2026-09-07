'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing, Share, SquarePlus } from 'lucide-react'
import { cancelarAvisosAction, inscreverAvisosAction } from '@/app/(loja)/pedido/[id]/acoes'
import { Botao, Cartao } from '@/components/ui'

/**
 * "Me avise quando ficar pronto."
 *
 * O cliente que pede para viagem fica olhando a tela ou perguntando no balcão.
 * Com isto ligado, o celular dele toca sozinho quando a cozinha marca o pedido
 * como pronto — mesmo com o aparelho no bolso e a tela apagada.
 *
 * Três realidades diferentes convivem aqui, e é por isso que o componente tem
 * tantos estados:
 *   • Android/computador: funciona no navegador mesmo, é só permitir.
 *   • iPhone: SÓ funciona com o site instalado na tela de início. No Safari
 *     comum não existe — não adianta pedir permissão, tem que explicar.
 *   • Quem já negou uma vez: o navegador não pergunta de novo. A única saída
 *     é a pessoa liberar nas configurações, então o recado tem que dizer isso.
 */

type Situacao =
  | 'checando'
  | 'sem_suporte'
  | 'iphone_sem_instalar'
  | 'bloqueado'
  | 'desligado'
  | 'ligado'

const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** O navegador exige a chave VAPID em bytes; ela viaja como texto base64url. */
function chaveEmBytes(base64: string) {
  const preenchido = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const cru = atob(preenchido)
  const bytes = new Uint8Array(cru.length)
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i)
  return bytes
}

/** As chaves da inscrição chegam como ArrayBuffer; o servidor guarda em texto. */
function chaveEmTexto(buffer: ArrayBuffer | null) {
  if (!buffer) return ''
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * A inscrição deste aparelho, se ainda servir.
 *
 * O "se ainda servir" não é preciosismo: a inscrição carrega a chave pública
 * que existia quando ela foi criada. Se as chaves do restaurante forem
 * trocadas, o aparelho continua achando que está inscrito e nunca mais recebe
 * nada — sem erro, sem aviso. Aqui a velha é descartada para uma nova nascer.
 */
async function inscricaoUtil(registro: ServiceWorkerRegistration) {
  const existente = await registro.pushManager.getSubscription()
  if (!existente) return null

  const chaveDaInscricao = existente.options?.applicationServerKey
  if (chaveDaInscricao && chaveEmTexto(chaveDaInscricao as ArrayBuffer) !== CHAVE_PUBLICA) {
    await existente.unsubscribe()
    return null
  }

  return existente
}

function ehIPhone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function estaInstalado() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export function AvisarQuandoFicarPronto({ pedidoId }: { pedidoId: string }) {
  const [situacao, setSituacao] = useState<Situacao>('checando')
  const [trabalhando, setTrabalhando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const registrar = useCallback(
    async (inscricao: PushSubscription) => {
      const chaves = {
        endpoint: inscricao.endpoint,
        p256dh: chaveEmTexto(inscricao.getKey('p256dh')),
        auth: chaveEmTexto(inscricao.getKey('auth')),
      }
      return inscreverAvisosAction(pedidoId, chaves)
    },
    [pedidoId]
  )

  useEffect(() => {
    if (!CHAVE_PUBLICA) return

    let vivo = true

    async function conferir() {
      const suportado =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

      if (!suportado) {
        // No iPhone o suporte só existe depois de instalado — então aqui a
        // resposta honesta não é "seu celular não dá", é "instale primeiro".
        if (vivo) setSituacao(ehIPhone() && !estaInstalado() ? 'iphone_sem_instalar' : 'sem_suporte')
        return
      }

      if (ehIPhone() && !estaInstalado()) {
        if (vivo) setSituacao('iphone_sem_instalar')
        return
      }

      if (Notification.permission === 'denied') {
        if (vivo) setSituacao('bloqueado')
        return
      }

      const registro = await navigator.serviceWorker.ready
      const existente = await inscricaoUtil(registro)

      if (!existente) {
        if (vivo) setSituacao('desligado')
        return
      }

      // Este aparelho já tinha avisos ligados — provavelmente de um pedido
      // anterior. Reapresenta a inscrição para que ela passe a valer para o
      // pedido desta tela também.
      await registrar(existente)
      if (vivo) setSituacao('ligado')
    }

    conferir().catch(() => {
      if (vivo) setSituacao('sem_suporte')
    })

    return () => {
      vivo = false
    }
  }, [registrar])

  async function ligar() {
    setTrabalhando(true)
    setErro(null)

    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setSituacao(permissao === 'denied' ? 'bloqueado' : 'desligado')
        return
      }

      const registro = await navigator.serviceWorker.ready
      const inscricao =
        (await inscricaoUtil(registro)) ??
        (await registro.pushManager.subscribe({
          // exigido pelo navegador: todo aviso recebido vira aviso visível
          userVisibleOnly: true,
          applicationServerKey: chaveEmBytes(CHAVE_PUBLICA),
        }))

      const resposta = await registrar(inscricao)
      if (!resposta.ok) {
        setErro(resposta.erro ?? 'Não consegui ligar os avisos.')
        return
      }

      setSituacao('ligado')
    } catch (falha) {
      console.warn('[push] não consegui inscrever', falha)
      setErro('Não consegui ligar os avisos neste aparelho.')
    } finally {
      setTrabalhando(false)
    }
  }

  async function desligar() {
    setTrabalhando(true)
    try {
      const registro = await navigator.serviceWorker.ready
      const inscricao = await registro.pushManager.getSubscription()
      if (inscricao) {
        await cancelarAvisosAction(inscricao.endpoint)
        await inscricao.unsubscribe()
      }
      setSituacao('desligado')
    } catch (falha) {
      console.warn('[push] não consegui desinscrever', falha)
    } finally {
      setTrabalhando(false)
    }
  }

  // Loja sem chave de push configurada, navegador sem suporte ou ainda
  // checando: nada na tela. Melhor não prometer o que não vai acontecer.
  if (!CHAVE_PUBLICA || situacao === 'checando' || situacao === 'sem_suporte') return null

  if (situacao === 'iphone_sem_instalar') {
    return (
      <Cartao className="mt-4 p-4">
        <h2 className="flex items-center gap-2 font-bold text-tinta-900">
          <Bell className="h-4 w-4" />
          Quer ser avisado quando ficar pronto?
        </h2>
        <p className="mt-1 text-sm text-tinta-500">
          No iPhone, o aviso só funciona com o cardápio instalado na tela de início. Leva dez
          segundos:
        </p>
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
        <p className="mt-3 text-sm text-tinta-500">
          Depois abra o pedido por lá e o botão de avisar aparece.
        </p>
      </Cartao>
    )
  }

  if (situacao === 'bloqueado') {
    return (
      <Cartao className="mt-4 p-4">
        <h2 className="flex items-center gap-2 font-bold text-tinta-900">
          <Bell className="h-4 w-4" />
          Avisos bloqueados
        </h2>
        <p className="mt-1 text-sm text-tinta-500">
          Este site está sem permissão para avisar neste aparelho. Para receber o &ldquo;pedido
          pronto&rdquo;, libere as notificações nas configurações do navegador e volte aqui.
        </p>
      </Cartao>
    )
  }

  if (situacao === 'ligado') {
    return (
      <Cartao className="mt-4 border-emerald-200 bg-emerald-50 p-4">
        <h2 className="flex items-center gap-2 font-bold text-emerald-800">
          <BellRing className="h-4 w-4" />
          Vamos te avisar
        </h2>
        <p className="mt-1 text-sm text-emerald-800/80">
          Assim que o pedido ficar pronto, seu celular toca — pode guardar no bolso.
        </p>
        <button
          type="button"
          onClick={desligar}
          disabled={trabalhando}
          className="mt-2 text-sm font-medium text-emerald-800/70 underline disabled:opacity-50"
        >
          Não quero mais ser avisado
        </button>
      </Cartao>
    )
  }

  return (
    <Cartao className="mt-4 p-4">
      <h2 className="flex items-center gap-2 font-bold text-tinta-900">
        <Bell className="h-4 w-4" />
        Avise quando ficar pronto
      </h2>
      <p className="mt-1 text-sm text-tinta-500">
        A gente toca no seu celular quando o pedido sair da cozinha. Assim você não precisa ficar
        olhando esta tela.
      </p>

      {erro && <p className="mt-2 text-sm font-medium text-marca-700">{erro}</p>}

      <Botao className="mt-3 h-11 w-full" onClick={ligar} disabled={trabalhando}>
        {trabalhando ? 'Um instante…' : 'Quero ser avisado'}
      </Botao>
    </Cartao>
  )
}
