import { GestaoCupons } from '@/components/admin/gestao-cupons'
import { criarClienteAdmin, usuarioAdminAtual } from '@/lib/supabase/server'
import type { Cupom } from '@/lib/types'

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PaginaCupons() {

  // O proxy já barra o atendente, mas a página confere de novo: se um dia o
  // matcher mudar, esta tela não vira porta aberta sem ninguém perceber.
  const quemEstaVendo = await usuarioAdminAtual()
  if (!quemEstaVendo?.ehDono) redirect('/admin?motivo=so_dono')
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
