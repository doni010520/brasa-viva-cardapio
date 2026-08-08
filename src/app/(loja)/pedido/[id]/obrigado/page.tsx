import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
// o lucide não traz ícone do Instagram (marca registrada); Camera diz a mesma coisa
import { Camera, Check, Receipt } from 'lucide-react'
import { ModalCampanha } from '@/components/loja/modal-campanha'
import { Botao, Cartao } from '@/components/ui'
import { confirmarPagamentoInfinitePay } from '@/lib/confirmar-infinitepay'
import { buscarConfiguracoes, buscarPedido } from '@/lib/dados'
import { moeda } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * Tela que o cliente vê logo depois de pagar.
 *
 * É o único momento em que ele está feliz, com o celular na mão e sem pressa —
 * por isso a campanha do restaurante mora aqui, e não perdida no rodapé.
 */
export default async function PaginaObrigado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, consulta] = await Promise.all([params, searchParams])
  let [pedido, config] = await Promise.all([buscarPedido(id), buscarConfiguracoes()])
  if (!pedido) notFound()

  // A volta da InfinitePay traz transaction_nsu e slug na URL: dá para
  // confirmar AGORA, sem esperar o webhook — o cliente já vê a festa.
  const transactionNsu = typeof consulta.transaction_nsu === 'string' ? consulta.transaction_nsu : null
  const slug = typeof consulta.slug === 'string' ? consulta.slug : null
  const reciboUrl = typeof consulta.receipt_url === 'string' ? consulta.receipt_url : null
  if (pedido.status_pagamento !== 'pago' && transactionNsu && slug) {
    const resultado = await confirmarPagamentoInfinitePay(pedido, transactionNsu, slug, reciboUrl)
    if (resultado === 'pago') pedido = (await buscarPedido(id)) ?? pedido
  }

  // ainda não pagou: não há o que agradecer
  if (pedido.status_pagamento !== 'pago' && pedido.forma_pagamento === 'online') {
    redirect(`/pedido/${pedido.id}`)
  }

  const codigo = String(pedido.numero).padStart(3, '0')
  const temCampanha = config.campanha_ativa && Boolean(config.instagram_url)

  return (
    <div className="py-8">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-8 w-8 text-emerald-600" strokeWidth={3} />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-tinta-900">
          {pedido.status_pagamento === 'pago' ? 'Pagamento confirmado!' : 'Pedido confirmado!'}
        </h1>
        <p className="mt-1 text-tinta-500">
          {pedido.tipo_entrega === 'entrega'
            ? 'Já avisamos a cozinha. É só aguardar.'
            : pedido.tipo_entrega === 'local'
              ? 'Apresente o código abaixo no salão.'
              : 'Já avisamos a cozinha. Passe no balcão com o código abaixo.'}
        </p>

        <p className="mt-5 text-sm font-medium text-tinta-500">Seu código</p>
        <p className="text-marca text-6xl font-black tabular-nums">{codigo}</p>
        <p className="mt-1 text-sm text-tinta-500">{moeda(pedido.total_centavos)}</p>
      </div>

      {/* ---------- Campanha ----------
          Vem em duas formas de propósito: o modal, que é o destaque e aparece
          uma vez só por pedido, e o cartão abaixo, que continua na página
          para quem fechou o modal e depois se interessou. */}
      {temCampanha && (
        <ModalCampanha
          pedidoId={pedido.id}
          titulo={config.campanha_titulo ?? 'Poste e ganhe!'}
          texto={config.campanha_texto}
          emoji={config.campanha_emoji ?? '🍫'}
          rotuloBotao={config.campanha_botao ?? 'Quero meu bombom'}
          instagramUrl={config.instagram_url!}
          nomeLoja={config.nome}
        />
      )}

      {temCampanha && (
        <Cartao className="border-marca mt-8 overflow-hidden border-2">
          <div className="bg-marca px-5 py-6 text-center text-white">
            <p className="text-5xl">{config.campanha_emoji ?? '🍫'}</p>
            <h2 className="mt-2 text-xl font-black">
              {config.campanha_titulo ?? 'Poste e ganhe!'}
            </h2>
          </div>

          <div className="p-5 text-center">
            <p className="text-tinta-600">{config.campanha_texto}</p>

            <a
              href={config.instagram_url!}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block"
            >
              <Botao className="h-12 w-full text-base">
                <Camera className="h-5 w-5" />
                {config.campanha_botao ?? 'Quero meu bombom'}
              </Botao>
            </a>

            <p className="mt-2 text-xs text-tinta-400">Abre o Instagram da {config.nome}</p>
          </div>
        </Cartao>
      )}

      <div className="mt-6 space-y-2">
        <Link href={`/pedido/${pedido.id}`} className="block">
          <Botao variante="fantasma" className="h-12 w-full">
            <Receipt className="h-4 w-4" />
            Acompanhar meu pedido
          </Botao>
        </Link>
        <Link href="/" className="block">
          <Botao variante="fantasma" className="w-full">
            Voltar ao cardápio
          </Botao>
        </Link>
      </div>
    </div>
  )
}
