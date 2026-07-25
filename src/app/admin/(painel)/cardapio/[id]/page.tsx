import { notFound } from 'next/navigation'
import { EditorProduto } from '@/components/admin/editor-produto'
import { buscarCardapio, buscarProduto } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export default async function PaginaEditorProduto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ categoria?: string }>
}) {
  const [{ id }, { categoria }] = await Promise.all([params, searchParams])
  const ehNovo = id === 'novo'

  const [categorias, produto] = await Promise.all([
    buscarCardapio(true),
    ehNovo ? Promise.resolve(null) : buscarProduto(id),
  ])

  if (!ehNovo && !produto) notFound()

  if (categorias.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-tinta-300 bg-white px-6 py-12 text-center">
        <p className="font-semibold text-tinta-700">Crie uma categoria primeiro</p>
        <p className="mt-1 text-sm text-tinta-500">
          Todo produto precisa morar dentro de uma categoria.
        </p>
      </div>
    )
  }

  return (
    <EditorProduto
      produto={produto}
      categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
      categoriaPadrao={categoria ?? categorias[0].id}
    />
  )
}
