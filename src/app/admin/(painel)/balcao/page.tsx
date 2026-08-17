import { LancamentoBalcao } from '@/components/admin/lancamento-balcao'
import { buscarCardapio } from '@/lib/dados'

export const dynamic = 'force-dynamic'

/**
 * A caixa registradora do balcão: quilo pela balança + itens do cardápio,
 * pedido nasce pago. Aberta para atendente e dono — é operação de caixa.
 */
export default async function PaginaBalcao() {
  const categorias = await buscarCardapio(true)

  // só o que dá para vender de fato: disponível e não-interno (o quilo tem campo próprio)
  const vendaveis = categorias
    .map((c) => ({
      ...c,
      produtos: c.produtos.filter((p) => p.disponivel && p.modo_consumo !== 'interno'),
    }))
    .filter((c) => c.ativo && c.produtos.length > 0)

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-tinta-900">Balcão</h1>
      <p className="mt-1 text-sm text-tinta-500">
        Lançamento de quem já pagou aqui: refeição no quilo pela balança e o que mais levou.
      </p>
      <LancamentoBalcao categorias={vendaveis} />
    </>
  )
}
