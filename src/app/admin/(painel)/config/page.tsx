import { FormularioConfig } from '@/components/admin/formulario-config'
import { buscarBairros, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { mercadoPagoConfigurado } from '@/lib/mercadopago'
import { whatsappConfigurado } from '@/lib/whatsapp'

import { redirect } from 'next/navigation'

import { usuarioAdminAtual } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PaginaConfig() {

  // O proxy já barra o atendente, mas a página confere de novo: se um dia o
  // matcher mudar, esta tela não vira porta aberta sem ninguém perceber.
  const quemEstaVendo = await usuarioAdminAtual()
  if (!quemEstaVendo?.ehDono) redirect('/admin?motivo=so_dono')
  const [config, horarios, bairros] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    buscarBairros(true),
  ])

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Configurações</h1>
        <p className="text-sm text-tinta-500">
          Dados da loja, horários, entrega e formas de pagamento.
        </p>
      </div>

      <FormularioConfig
        config={config}
        horarios={horarios}
        bairros={bairros}
        mercadoPagoLigado={mercadoPagoConfigurado()}
        whatsappLigado={whatsappConfigurado()}
      />
    </>
  )
}
