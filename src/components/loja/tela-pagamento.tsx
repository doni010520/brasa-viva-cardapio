'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Cartao } from '@/components/ui'
import { moeda } from '@/lib/format'

/**
 * Pagamento sem sair do site, com o Payment Brick do Mercado Pago.
 *
 * Os dados do cartão vão do navegador direto para o Mercado Pago, que devolve
 * um token. Número de cartão nunca chega ao nosso servidor — é o que nos tira
 * do escopo pesado de PCI.
 */

type BrickController = { unmount?: () => void }

declare global {
  interface Window {
    MercadoPago?: new (
      chave: string,
      opcoes?: { locale?: string }
    ) => {
      bricks: () => {
        create: (
          tipo: string,
          container: string,
          config: unknown
        ) => Promise<BrickController>
      }
    }
  }
}

export function TelaPagamento({
  pedidoId,
  numero,
  totalCentavos,
  emailCliente,
  cpfCliente,
  chavePublica,
  aceitaPix,
  aceitaCartao,
}: {
  pedidoId: string
  numero: number
  totalCentavos: number
  emailCliente: string | null
  cpfCliente: string | null
  chavePublica: string
  aceitaPix: boolean
  aceitaCartao: boolean
}) {
  const router = useRouter()
  const [sdkPronto, setSdkPronto] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const brick = useRef<BrickController | null>(null)
  const montado = useRef(false)

  useEffect(() => {
    if (!sdkPronto || montado.current || !window.MercadoPago) return
    montado.current = true

    const mp = new window.MercadoPago(chavePublica, { locale: 'pt-BR' })

    mp.bricks()
      .create('payment', 'brick-pagamento', {
        initialization: {
          amount: Number((totalCentavos / 100).toFixed(2)),
          payer: {
            ...(emailCliente ? { email: emailCliente } : {}),
            ...(cpfCliente
              ? { identification: { type: 'CPF', number: cpfCliente } }
              : {}),
          },
        },
        customization: {
          paymentMethods: {
            ...(aceitaPix ? { bankTransfer: 'all' } : {}),
            ...(aceitaCartao ? { creditCard: 'all' } : {}),
            maxInstallments: 1,
          },
          visual: {
            hideFormTitle: true,
            style: { theme: 'default' },
          },
        },
        callbacks: {
          onReady: () => setCarregando(false),

          onSubmit: async ({ formData }: { formData: unknown }) => {
            setErro('')
            const resposta = await fetch('/api/pagamentos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pedidoId, dados: formData }),
            })

            const corpo = await resposta.json().catch(() => ({}))

            if (!resposta.ok || !corpo.ok) {
              setErro(corpo.erro ?? 'Não consegui processar o pagamento. Tente de novo.')
              // rejeita para o Brick reabilitar o botão
              throw new Error(corpo.erro ?? 'falha no pagamento')
            }

            if (corpo.aprovado || corpo.pendente) {
              router.push(`/pedido/${pedidoId}`)
              return
            }

            setErro(corpo.erro ?? 'O pagamento não foi aprovado.')
            throw new Error('pagamento recusado')
          },

          onError: (erroBrick: { message?: string }) => {
            console.error('[brick]', erroBrick)
            setCarregando(false)
            setErro(
              erroBrick?.message
                ? `Não consegui abrir o pagamento: ${erroBrick.message}`
                : 'Não consegui abrir o formulário de pagamento. Atualize a página.'
            )
          },
        },
      })
      .then((controlador) => {
        brick.current = controlador
      })
      .catch((e) => {
        console.error(e)
        setCarregando(false)
        setErro('Não consegui abrir o formulário de pagamento. Atualize a página.')
      })

    return () => {
      brick.current?.unmount?.()
      brick.current = null
      montado.current = false
    }
  }, [
    sdkPronto,
    chavePublica,
    totalCentavos,
    emailCliente,
    cpfCliente,
    pedidoId,
    aceitaPix,
    aceitaCartao,
    router,
  ])

  return (
    <div className="py-6">
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        onLoad={() => setSdkPronto(true)}
        onError={() => {
          setCarregando(false)
          setErro('Não consegui carregar o Mercado Pago. Confira sua conexão.')
        }}
      />

      <div className="text-center">
        <p className="text-sm font-medium text-tinta-500">
          Pedido #{String(numero).padStart(3, '0')}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-tinta-900">
          Pagamento de {moeda(totalCentavos)}
        </h1>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-tinta-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Processado pelo Mercado Pago. Seus dados não passam pela nossa loja.
        </p>
      </div>

      {erro && (
        <p className="mt-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      <Cartao className="mt-4 p-4">
        {carregando && (
          <div className="flex flex-col items-center gap-2 py-10 text-tinta-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Abrindo as formas de pagamento...</span>
          </div>
        )}
        <div id="brick-pagamento" />
      </Cartao>

      <p className="mt-4 text-center text-xs text-tinta-400">
        Seu pedido só entra na cozinha depois que o pagamento for confirmado.
      </p>
    </div>
  )
}
