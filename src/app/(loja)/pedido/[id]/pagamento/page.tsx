import { notFound, redirect } from 'next/navigation'
import { TelaPagamento } from '@/components/loja/tela-pagamento'
import { buscarConfiguracoes, buscarPedido } from '@/lib/dados'
import { chavePublicaMercadoPago, mercadoPagoConfigurado } from '@/lib/mercadopago'
import { Cartao } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function PaginaPagamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [pedido, config] = await Promise.all([buscarPedido(id), buscarConfiguracoes()])
  if (!pedido) notFound()

  // já pago, ou é pedido para pagar na hora: não há o que cobrar aqui
  if (pedido.status_pagamento === 'pago' || pedido.forma_pagamento === 'local') {
    redirect(`/pedido/${pedido.id}`)
  }
  // Pix já gerado e ainda válido: mostra o QR em vez de pedir tudo de novo
  if (pedido.pix_copia_cola && pedido.status_pagamento === 'pendente') {
    redirect(`/pedido/${pedido.id}`)
  }

  const chavePublica = chavePublicaMercadoPago()

  if (!mercadoPagoConfigurado() || !chavePublica) {
    return (
      <div className="py-10">
        <Cartao className="border-amber-200 bg-amber-50 p-5 text-center">
          <p className="font-bold text-amber-800">Pagamento online indisponível</p>
          <p className="mt-1 text-sm text-amber-800/80">
            O Mercado Pago ainda não foi configurado. Fale com a {config.nome} pelo telefone{' '}
            {config.telefone} para combinar o pagamento do pedido{' '}
            <strong>#{String(pedido.numero).padStart(3, '0')}</strong>.
          </p>
        </Cartao>
      </div>
    )
  }

  return (
    <TelaPagamento
      pedidoId={pedido.id}
      numero={pedido.numero}
      totalCentavos={pedido.total_centavos}
      emailCliente={pedido.cliente_email}
      cpfCliente={pedido.cliente_cpf}
      chavePublica={chavePublica}
      aceitaPix={config.aceita_pix}
      aceitaCartao={config.aceita_cartao}
    />
  )
}
