import { GestaoCupons } from '@/components/admin/gestao-cupons'
import { criarClienteAdmin } from '@/lib/supabase/server'
import type { Cupom } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PaginaCupons() {
  const supabase = criarClienteAdmin()
  const { data } = await supabase.from('cupons').select('*').order('criado_em', { ascending: false })

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Cupons</h1>
        <p className="text-sm text-tinta-500">
          O cliente digita o código no checkout e o desconto entra na hora.
        </p>
      </div>

      <GestaoCupons cupons={(data ?? []) as Cupom[]} />
    </>
  )
}
