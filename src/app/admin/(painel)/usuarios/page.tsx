import { redirect } from 'next/navigation'
import { GestaoEquipe } from '@/components/admin/gestao-equipe'
import { criarClienteAdmin, usuarioAdminAtual } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export type MembroEquipe = {
  user_id: string
  nome: string | null
  email: string | null
  papel: 'dono' | 'atendente'
  ativo: boolean
  criado_em: string
}

export default async function PaginaUsuarios() {
  const admin = await usuarioAdminAtual()
  // o proxy já barra, mas a página confere de novo: se um dia o matcher mudar,
  // esta tela não vira uma porta aberta sem ninguém perceber
  if (!admin?.ehDono) redirect('/admin')

  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('admins')
    .select('user_id, nome, email, papel, ativo, criado_em')
    .order('papel')
    .order('criado_em')

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Equipe</h1>
        <p className="text-sm text-tinta-500">
          Quem pode entrar no painel e até onde cada um vai.
        </p>
      </div>

      <GestaoEquipe membros={(data ?? []) as MembroEquipe[]} meuId={admin.id} />
    </>
  )
}
