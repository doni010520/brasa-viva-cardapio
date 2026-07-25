import { FormularioLogin } from '@/components/admin/formulario-login'
import { buscarConfiguracoes } from '@/lib/dados'
import { Marca } from '@/components/marca'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>
}) {
  const [{ proximo }, config] = await Promise.all([searchParams, buscarConfiguracoes()])

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-carvao-900 px-4"
      style={{ '--marca': config.cor_primaria } as React.CSSProperties}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Marca nome={config.nome} logoUrl={config.logo_url} />
        </div>

        <div className="rounded-2xl bg-white p-6">
          <h1 className="text-xl font-bold text-tinta-900">Painel do restaurante</h1>
          <p className="mt-1 mb-5 text-sm text-tinta-500">
            Entre para ver os pedidos e mexer no cardápio.
          </p>

          <FormularioLogin proximo={proximo ?? '/admin'} />
        </div>

        <p className="mt-4 text-center text-xs text-tinta-400">
          Acesso restrito à equipe da {config.nome}.
        </p>
      </div>
    </div>
  )
}
