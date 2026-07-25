'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, Store, UtensilsCrossed } from 'lucide-react'
import { escolherModoAction } from '@/app/(loja)/acoes-modo'
import type { ModoConsumo } from '@/lib/types'

/**
 * Primeira pergunta do site. O cardápio depende dela: buffet livre só faz
 * sentido para quem está no salão, marmita embalada só para quem vai levar.
 */
export function EscolhaModo({
  nomeLoja,
  descricao,
  aceitaLocal,
  aceitaRetirada,
  aceitaEntrega,
  precoBuffetCentavos,
}: {
  nomeLoja: string
  descricao: string | null
  aceitaLocal: boolean
  aceitaRetirada: boolean
  aceitaEntrega: boolean
  precoBuffetCentavos: number | null
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()

  function escolher(modo: ModoConsumo) {
    salvar(async () => {
      await escolherModoAction(modo)
      router.refresh()
    })
  }

  const podeViagem = aceitaRetirada || aceitaEntrega

  return (
    <div className="py-10">
      <div className="text-center">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">{nomeLoja}</h1>
        {descricao && <p className="mt-1 text-tinta-500">{descricao}</p>}
        <p className="mt-6 font-semibold text-tinta-900">Onde você vai comer hoje?</p>
        <p className="text-sm text-tinta-500">O cardápio muda conforme a sua resposta.</p>
      </div>

      <div className="mt-6 space-y-3">
        {aceitaLocal && (
          <Opcao
            aoEscolher={() => escolher('local')}
            carregando={salvando}
            icone={<UtensilsCrossed className="h-6 w-6" />}
            titulo="Estou no restaurante"
            descricao={
              precoBuffetCentavos
                ? 'Buffet livre e bebidas. Pague por aqui e sirva-se.'
                : 'Peça e pague pelo celular, sem fila no caixa.'
            }
            destaque
          />
        )}

        {podeViagem && (
          <Opcao
            aoEscolher={() => escolher('viagem')}
            carregando={salvando}
            icone={aceitaEntrega ? <Bike className="h-6 w-6" /> : <Store className="h-6 w-6" />}
            titulo={
              aceitaEntrega && aceitaRetirada
                ? 'Pedido para entrega ou retirada'
                : aceitaEntrega
                  ? 'Pedido para entrega'
                  : 'Pedido para retirada'
            }
            descricao={
              aceitaEntrega && aceitaRetirada
                ? 'Marmitas, porções e bebidas. Você escolhe entre receber em casa ou buscar no balcão.'
                : aceitaEntrega
                  ? 'Marmitas, porções e bebidas entregues no seu endereço.'
                  : 'Marmitas, porções e bebidas para buscar no balcão.'
            }
          />
        )}
      </div>

      {aceitaLocal && (
        <p className="mt-6 text-center text-xs text-tinta-400">
          Comida no quilo é direto no balcão: sirva-se e pese na hora, sem precisar pedir por
          aqui.
        </p>
      )}
    </div>
  )
}

function Opcao({
  aoEscolher,
  carregando,
  icone,
  titulo,
  descricao,
  destaque = false,
}: {
  aoEscolher: () => void
  carregando: boolean
  icone: React.ReactNode
  titulo: string
  descricao: string
  destaque?: boolean
}) {
  return (
    <button
      onClick={aoEscolher}
      disabled={carregando}
      className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition disabled:opacity-60 ${
        destaque
          ? 'border-marca bg-white hover:bg-marca-50'
          : 'border-tinta-200 bg-white hover:border-tinta-300'
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          destaque ? 'bg-marca text-white' : 'bg-tinta-100 text-tinta-600'
        }`}
      >
        {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : icone}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-tinta-900">{titulo}</span>
        <span className="block text-sm text-tinta-500">{descricao}</span>
      </span>
    </button>
  )
}
