import { redirect } from 'next/navigation'
import { GestaoCardapio } from '@/components/admin/gestao-cardapio'
import { buscarCardapio } from '@/lib/dados'
import { usuarioAdminAtual } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PaginaCardapioAdmin() {
  const admin = await usuarioAdminAtual()
  if (!admin) redirect('/admin/login')

  const categorias = await buscarCardapio(true)

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Cardápio</h1>
        <p className="text-sm text-tinta-500">
          {admin.ehDono
            ? 'O que você mudar aqui aparece na hora para o cliente.'
            : 'Acabou algum item? Marque como esgotado e ele some do cardápio na hora.'}
        </p>
      </div>

      <GestaoCardapio categorias={categorias} ehDono={admin.ehDono} />
    </>
  )
}
