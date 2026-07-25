import { GestaoCardapio } from '@/components/admin/gestao-cardapio'
import { buscarCardapio } from '@/lib/dados'

export const dynamic = 'force-dynamic'

export default async function PaginaCardapioAdmin() {
  const categorias = await buscarCardapio(true)

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Cardápio</h1>
        <p className="text-sm text-tinta-500">
          O que você mudar aqui aparece na hora para o cliente.
        </p>
      </div>

      <GestaoCardapio categorias={categorias} />
    </>
  )
}
