import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import {
  Bike,
  Check,
  ChefHat,
  CircleDot,
  Clock,
  MapPin,
  PackageCheck,
  ShoppingBag,
  XCircle,
} from 'lucide-react'
import { AtualizacaoAutomatica } from '@/components/loja/atualizacao-automatica'
import { PainelPix } from '@/components/loja/painel-pix'
import { Botao, Cartao, Selo } from '@/components/ui'
import { buscarConfiguracoes, buscarPedido } from '@/lib/dados'
import { moeda } from '@/lib/format'
import { dataHoraCurta, horaCurta } from '@/lib/tempo'
import { rotuloOpcao, rotuloStatus, type StatusPedido, type TipoEntrega } from '@/lib/types'

export const dynamic = 'force-dynamic'

function etapasDoPedido(tipo: TipoEntrega) {
  const comuns = [
    { chave: 'recebido' as StatusPedido, icone: <ShoppingBag className="h-4 w-4" /> },
    { chave: 'em_preparo' as StatusPedido, icone: <ChefHat className="h-4 w-4" /> },
    { chave: 'pronto' as StatusPedido, icone: <PackageCheck className="h-4 w-4" /> },
  ]

  const finais =
    tipo === 'entrega'
      ? [
          { chave: 'saiu_para_entrega' as StatusPedido, icone: <Bike className="h-4 w-4" /> },
          { chave: 'retirado' as StatusPedido, icone: <Check className="h-4 w-4" /> },
        ]
      : [{ chave: 'retirado' as StatusPedido, icone: <Check className="h-4 w-4" /> }]

  return [...comuns, ...finais].map((etapa) => ({
    ...etapa,
    rotulo: rotuloStatus(etapa.chave, tipo),
  }))
}

export default async function PaginaPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [pedido, config] = await Promise.all([buscarPedido(id), buscarConfiguracoes()])
  if (!pedido) notFound()

  const ehEntrega = pedido.tipo_entrega === 'entrega'
  const aguardandoPagamento = pedido.status === 'aguardando_pagamento'
  const cancelado = pedido.status === 'cancelado'
  const finalizado = pedido.status === 'retirado'

  const etapas = etapasDoPedido(pedido.tipo_entrega)
  const etapaAtual = etapas.findIndex((e) => e.chave === pedido.status)

  // QR do Pix desenhado aqui no servidor, a partir do código copia-e-cola
  const mostrarPix = aguardandoPagamento && Boolean(pedido.pix_copia_cola)
  const qrSvg = mostrarPix
    ? await QRCode.toString(pedido.pix_copia_cola!, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      })
    : ''

  return (
    <div className="py-6">
      {!cancelado && !finalizado && <AtualizacaoAutomatica segundos={20} />}

      <div className="text-center">
        <p className="text-sm font-medium text-tinta-500">
          {ehEntrega ? 'Número do seu pedido' : 'Seu código de retirada'}
        </p>
        <p className="text-marca mt-1 text-6xl font-black tabular-nums">
          {String(pedido.numero).padStart(3, '0')}
        </p>
        <p className="mt-1 text-sm text-tinta-500">
          {ehEntrega
            ? `Guarde este número para falar com a ${config.nome}.`
            : `Mostre este número no balcão da ${config.nome}.`}
        </p>
      </div>

      {/* ---------- Situação ---------- */}
      {cancelado ? (
        <Cartao className="mt-6 border-marca-100 bg-marca-50 p-4 text-center">
          <XCircle className="text-marca mx-auto h-8 w-8" />
          <p className="mt-2 font-bold text-marca-700">Pedido cancelado</p>
          <p className="mt-1 text-sm text-marca-700/80">
            Se isso não era esperado, fale com a gente pelo telefone {config.telefone}.
          </p>
        </Cartao>
      ) : mostrarPix ? (
        <PainelPix
          pedidoId={pedido.id}
          copiaCola={pedido.pix_copia_cola!}
          qrSvg={qrSvg}
          expiraEm={pedido.pix_expira_em}
          totalCentavos={pedido.total_centavos}
        />
      ) : aguardandoPagamento ? (
        <Cartao className="mt-6 border-amber-200 bg-amber-50 p-4 text-center">
          <Clock className="mx-auto h-8 w-8 text-amber-600" />
          <p className="mt-2 font-bold text-amber-800">Falta pagar</p>
          <p className="mt-1 text-sm text-amber-800/80">
            {pedido.pagamento_detalhe
              ? 'A tentativa anterior não foi aprovada. Você pode tentar de novo.'
              : 'Seu pedido só entra na fila da cozinha depois do pagamento.'}
          </p>
          {/* InfinitePay: o link de pagamento já existe, é só voltar para ele.
              Sem link (fluxo Mercado Pago), a tela de pagamento é interna. */}
          {pedido.ip_link_url ? (
            <a href={pedido.ip_link_url} className="mt-3 inline-block">
              <Botao>Pagar agora</Botao>
            </a>
          ) : (
            <Link href={`/pedido/${pedido.id}/pagamento`} className="mt-3 inline-block">
              <Botao>Pagar agora</Botao>
            </Link>
          )}
        </Cartao>
      ) : (
        <Cartao className="mt-6 p-4">
          <ol className="space-y-3">
            {etapas.map((etapa, indice) => {
              const concluida = indice < etapaAtual
              const atual = indice === etapaAtual

              return (
                <li key={etapa.chave} className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      concluida
                        ? 'bg-emerald-100 text-emerald-700'
                        : atual
                          ? 'bg-marca text-white'
                          : 'bg-tinta-100 text-tinta-400'
                    }`}
                  >
                    {concluida ? <Check className="h-4 w-4" /> : etapa.icone}
                  </span>
                  <span
                    className={`font-semibold ${
                      atual ? 'text-tinta-900' : concluida ? 'text-tinta-600' : 'text-tinta-400'
                    }`}
                  >
                    {etapa.rotulo}
                  </span>
                  {atual && !finalizado && (
                    <CircleDot className="text-marca ml-auto h-4 w-4 animate-pulse" />
                  )}
                </li>
              )
            })}
          </ol>

          {pedido.retirada_prevista && !finalizado && (
            <p className="mt-4 rounded-xl bg-tinta-50 px-3.5 py-2.5 text-sm text-tinta-600">
              {ehEntrega ? 'Entrega prevista para as ' : 'Retirada combinada para as '}
              <strong>{horaCurta(pedido.retirada_prevista)}</strong>.
            </p>
          )}
        </Cartao>
      )}

      {/* ---------- Endereço da entrega ---------- */}
      {ehEntrega && (
        <Cartao className="mt-4 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-tinta-900">
            <MapPin className="h-4 w-4" />
            Entregamos em
          </h2>
          <p className="text-sm text-tinta-600">
            {pedido.endereco_rua}, {pedido.endereco_numero}
            {pedido.endereco_complemento && ` — ${pedido.endereco_complemento}`}
            <br />
            {pedido.endereco_bairro}
            {pedido.endereco_referencia && (
              <>
                <br />
                <span className="text-tinta-400">Ref.: {pedido.endereco_referencia}</span>
              </>
            )}
          </p>
        </Cartao>
      )}

      {/* ---------- Itens ---------- */}
      <Cartao className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-tinta-900">Seu pedido</h2>
          <Selo tom={pedido.status_pagamento === 'pago' ? 'verde' : 'neutro'}>
            {pedido.status_pagamento === 'pago'
              ? 'Pago'
              : pedido.forma_pagamento === 'local'
                ? 'Pagar na retirada'
                : 'Pagamento pendente'}
          </Selo>
        </div>

        <ul className="space-y-2 text-sm">
          {(pedido.itens ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="text-tinta-600">
                {item.quantidade}x {item.produto_nome}
                {item.opcoes.length > 0 && (
                  <span className="block text-xs text-tinta-400">
                    {item.opcoes.map((o) => rotuloOpcao(o)).join(', ')}
                  </span>
                )}
                {item.observacao && (
                  <span className="block text-xs text-tinta-400 italic">“{item.observacao}”</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{moeda(item.total_centavos)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1.5 border-t border-tinta-200 pt-3 text-sm">
          <div className="flex justify-between text-tinta-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{moeda(pedido.subtotal_centavos)}</span>
          </div>
          {pedido.desconto_centavos > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto {pedido.cupom_codigo && `(${pedido.cupom_codigo})`}</span>
              <span className="tabular-nums">− {moeda(pedido.desconto_centavos)}</span>
            </div>
          )}
          {ehEntrega && (
            <div className="flex justify-between text-tinta-600">
              <span>Taxa de entrega</span>
              <span className="tabular-nums">
                {pedido.entrega_taxa_centavos === 0 ? (
                  <span className="font-semibold text-emerald-700">grátis</span>
                ) : (
                  moeda(pedido.entrega_taxa_centavos)
                )}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-lg font-bold text-tinta-900">
            <span>Total</span>
            <span className="tabular-nums">{moeda(pedido.total_centavos)}</span>
          </div>
        </div>

        {pedido.observacoes && (
          <p className="mt-3 rounded-xl bg-tinta-50 px-3.5 py-2.5 text-sm text-tinta-600">
            <strong className="font-semibold">Observação:</strong> {pedido.observacoes}
          </p>
        )}

        <p className="mt-3 text-xs text-tinta-400">
          Pedido feito em {dataHoraCurta(pedido.criado_em)} · {pedido.cliente_nome}
        </p>
      </Cartao>

      <div className="mt-4 text-center">
        <Link href="/">
          <Botao variante="fantasma">Voltar ao cardápio</Botao>
        </Link>
      </div>
    </div>
  )
}
