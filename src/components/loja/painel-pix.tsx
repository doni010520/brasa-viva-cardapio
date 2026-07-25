'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { verificarPagamentoAction } from '@/app/(loja)/pedido/[id]/acoes'
import { Botao, Cartao } from '@/components/ui'
import { moeda } from '@/lib/format'

/**
 * Tela do Pix: QR grande, copia-e-cola e contagem regressiva.
 *
 * Enquanto o cliente olha, a página pergunta ao Mercado Pago de 5 em 5
 * segundos se o dinheiro caiu — assim ele vê a confirmação sem apertar nada.
 */
export function PainelPix({
  pedidoId,
  copiaCola,
  qrSvg,
  expiraEm,
  totalCentavos,
}: {
  pedidoId: string
  copiaCola: string
  qrSvg: string
  expiraEm: string | null
  totalCentavos: number
}) {
  const router = useRouter()
  const [copiado, setCopiado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [verificando, verificar] = useTransition()
  const [restante, setRestante] = useState<number | null>(null)

  // contagem regressiva
  useEffect(() => {
    if (!expiraEm) return
    const calcular = () =>
      setRestante(Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000)))
    calcular()
    const relogio = setInterval(calcular, 1000)
    return () => clearInterval(relogio)
  }, [expiraEm])

  // consulta automática enquanto a aba está aberta
  useEffect(() => {
    const consulta = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const resposta = await verificarPagamentoAction(pedidoId)
      if (resposta.pago) {
        clearInterval(consulta)
        router.push(`/pedido/${pedidoId}/obrigado`)
      }
    }, 5000)
    return () => clearInterval(consulta)
  }, [pedidoId, router])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(copiaCola)
    } catch {
      // navegador antigo ou sem permissão: seleciona para o cliente copiar na mão
      const campo = document.getElementById('pix-copia-cola') as HTMLTextAreaElement | null
      campo?.select()
      document.execCommand?.('copy')
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  function conferirAgora() {
    setMensagem('')
    verificar(async () => {
      const resposta = await verificarPagamentoAction(pedidoId)
      setMensagem(resposta.mensagem)
      if (resposta.pago) router.refresh()
    })
  }

  const expirou = restante !== null && restante === 0
  const minutos = restante !== null ? Math.floor(restante / 60) : 0
  const segundos = restante !== null ? restante % 60 : 0

  return (
    <Cartao className="mt-6 p-5">
      <h2 className="flex items-center justify-center gap-2 text-center font-bold text-tinta-900">
        <QrCode className="h-5 w-5" />
        Pague {moeda(totalCentavos)} no Pix
      </h2>

      {expirou ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-4 text-center text-sm text-amber-800">
          <p className="font-semibold">Este código Pix venceu.</p>
          <p className="mt-1">Gere um novo para concluir o pedido.</p>
          <a href={`/pedido/${pedidoId}/pagamento`} className="mt-3 inline-block">
            <Botao>
              <RefreshCw className="h-4 w-4" />
              Gerar novo Pix
            </Botao>
          </a>
        </div>
      ) : (
        <>
          <p className="mt-1 text-center text-sm text-tinta-500">
            Abra o app do banco, escolha Pix e aponte a câmera para o código.
          </p>

          <div className="mt-4 flex justify-center">
            <div
              className="rounded-2xl border border-tinta-200 bg-white p-3 [&>svg]:h-56 [&>svg]:w-56"
              // SVG gerado no servidor a partir do código copia-e-cola
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>

          {restante !== null && (
            <p className="mt-3 text-center text-sm text-tinta-500">
              Vence em{' '}
              <strong className="tabular-nums text-tinta-900">
                {minutos}:{String(segundos).padStart(2, '0')}
              </strong>
            </p>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-tinta-700">
              Ou use o Pix copia e cola:
            </p>
            <textarea
              id="pix-copia-cola"
              readOnly
              value={copiaCola}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full resize-none rounded-xl border border-tinta-200 bg-tinta-50 p-3 font-mono text-[11px] break-all text-tinta-600"
            />
            <Botao onClick={copiar} className="mt-2 h-11 w-full">
              {copiado ? (
                <>
                  <Check className="h-4 w-4" />
                  Código copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar código Pix
                </>
              )}
            </Botao>
          </div>

          <div className="mt-4 border-t border-tinta-200 pt-4">
            <p className="text-center text-xs text-tinta-400">
              Assim que o pagamento cair, esta tela muda sozinha.
            </p>
            <Botao
              variante="fantasma"
              onClick={conferirAgora}
              disabled={verificando}
              className="mt-2 w-full"
            >
              {verificando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Já paguei, conferir agora
            </Botao>
            {mensagem && (
              <p className="mt-2 text-center text-sm text-tinta-600">{mensagem}</p>
            )}
          </div>
        </>
      )}
    </Cartao>
  )
}
