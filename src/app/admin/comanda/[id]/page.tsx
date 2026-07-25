import { notFound, redirect } from 'next/navigation'
import { ImpressaoAutomatica } from '@/components/admin/impressao-automatica'
import { buscarConfiguracoes, buscarPedido } from '@/lib/dados'
import { moeda } from '@/lib/format'
import { dataHoraCurta, horaCurta } from '@/lib/tempo'
import { usuarioAdminAtual } from '@/lib/supabase/server'
import { rotuloStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Comanda da cozinha, pensada para bobina de 80mm.
 * Abre em aba nova e já chama a caixa de impressão.
 */
export default async function PaginaComanda({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, admin] = await Promise.all([params, usuarioAdminAtual()])
  if (!admin) redirect('/admin/login')

  const [pedido, config] = await Promise.all([buscarPedido(id), buscarConfiguracoes()])
  if (!pedido) notFound()

  const ehEntrega = pedido.tipo_entrega === 'entrega'
  const codigo = String(pedido.numero).padStart(3, '0')

  return (
    <div className="mx-auto max-w-[80mm] bg-white p-3 font-mono text-[13px] leading-tight text-black">
      <ImpressaoAutomatica codigo={codigo} />

      {/* ---------- cabeçalho ---------- */}
      <div className="text-center">
        <p className="text-base font-bold uppercase">{config.nome}</p>
        <p className="text-[11px]">{dataHoraCurta(pedido.criado_em)}</p>
      </div>

      <Divisor />

      <p className="text-center text-3xl font-black">#{codigo}</p>
      <p className="text-center text-sm font-bold uppercase">
        {pedido.tipo_entrega === 'entrega'
          ? '>> ENTREGA <<'
          : pedido.tipo_entrega === 'local'
            ? '>> SALAO <<'
            : '>> RETIRADA <<'}
      </p>

      <Divisor />

      {/* ---------- cliente ---------- */}
      <p>
        <strong>Cliente:</strong> {pedido.cliente_nome}
      </p>
      <p>
        <strong>Fone:</strong> {pedido.cliente_telefone}
      </p>
      {pedido.retirada_prevista && (
        <p>
          <strong>{ehEntrega ? 'Previsto:' : 'Retirada:'}</strong>{' '}
          {horaCurta(pedido.retirada_prevista)}
        </p>
      )}

      {ehEntrega && (
        <>
          <Divisor />
          <p className="font-bold uppercase">Endereço</p>
          <p>
            {pedido.endereco_rua}, {pedido.endereco_numero}
            {pedido.endereco_complemento && ` - ${pedido.endereco_complemento}`}
          </p>
          <p>{pedido.endereco_bairro}</p>
          {pedido.endereco_referencia && <p>Ref.: {pedido.endereco_referencia}</p>}
        </>
      )}

      <Divisor />

      {/* ---------- itens ---------- */}
      {(pedido.itens ?? []).map((item) => (
        <div key={item.id} className="mb-2">
          <div className="flex justify-between gap-2">
            <span className="font-bold">
              {item.quantidade}x {item.produto_nome}
            </span>
            <span>{moeda(item.total_centavos)}</span>
          </div>
          {item.opcoes.map((opcao, indice) => (
            <p key={`${opcao.nome}-${indice}`} className="pl-3 text-[12px]">
              - {opcao.nome}
              {opcao.preco_extra_centavos > 0 && ` (${moeda(opcao.preco_extra_centavos)})`}
            </p>
          ))}
          {item.observacao && (
            <p className="pl-3 text-[12px] font-bold">** {item.observacao.toUpperCase()}</p>
          )}
        </div>
      ))}

      <Divisor />

      {/* ---------- valores ---------- */}
      <Linha rotulo="Subtotal" valor={moeda(pedido.subtotal_centavos)} />
      {pedido.desconto_centavos > 0 && (
        <Linha
          rotulo={`Desconto ${pedido.cupom_codigo ?? ''}`.trim()}
          valor={`- ${moeda(pedido.desconto_centavos)}`}
        />
      )}
      {pedido.entrega_taxa_centavos > 0 && (
        <Linha rotulo="Taxa de entrega" valor={moeda(pedido.entrega_taxa_centavos)} />
      )}
      <div className="mt-1 flex justify-between text-base font-black">
        <span>TOTAL</span>
        <span>{moeda(pedido.total_centavos)}</span>
      </div>

      <Divisor />

      <p className="text-center font-bold uppercase">
        {pedido.status_pagamento === 'pago'
          ? '*** PAGO ***'
          : pedido.forma_pagamento === 'local'
            ? // entrega é sempre paga pelo site, então "local" só existe na retirada
              '*** COBRAR NO BALCAO ***'
            : '*** PAGAMENTO PENDENTE ***'}
      </p>

      {pedido.observacoes && (
        <>
          <Divisor />
          <p className="font-bold uppercase">Observação</p>
          <p className="font-bold">{pedido.observacoes.toUpperCase()}</p>
        </>
      )}

      <Divisor />
      <p className="text-center text-[11px]">
        {rotuloStatus(pedido.status, pedido.tipo_entrega)}
      </p>
      <p className="mt-3 text-center text-[11px]">.</p>
    </div>
  )
}

function Divisor() {
  return <p className="my-2 overflow-hidden text-[11px] whitespace-nowrap">{'='.repeat(42)}</p>
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  )
}
