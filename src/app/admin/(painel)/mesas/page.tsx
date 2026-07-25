import QRCode from 'qrcode'
import { GestaoMesas } from '@/components/admin/gestao-mesas'
import { buscarConfiguracoes } from '@/lib/dados'
import { urlBase } from '@/lib/mercadopago'
import { criarClienteAdmin, usuarioAdminAtual } from '@/lib/supabase/server'
import type { Mesa } from '@/lib/types'

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PaginaMesas() {

  // O proxy já barra o atendente, mas a página confere de novo: se um dia o
  // matcher mudar, esta tela não vira porta aberta sem ninguém perceber.
  const quemEstaVendo = await usuarioAdminAtual()
  if (!quemEstaVendo?.ehDono) redirect('/admin?motivo=so_dono')
  const supabase = criarClienteAdmin()
  const [{ data }, config, base] = await Promise.all([
    supabase.from('mesas').select('*').order('ordem').order('numero'),
    buscarConfiguracoes(),
    urlBase(),
  ])

  const mesas = (data ?? []) as Mesa[]

  // QR desenhado no servidor: nada de depender de serviço externo para
  // imprimir o cartaz da mesa.
  const comQr = await Promise.all(
    mesas.map(async (mesa) => ({
      mesa,
      url: `${base}/mesa/${encodeURIComponent(mesa.numero)}`,
      svg: await QRCode.toString(`${base}/mesa/${encodeURIComponent(mesa.numero)}`, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      }),
    }))
  )

  return (
    <>
      <div className="sem-impressao mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Mesas e QR Code</h1>
        <p className="text-sm text-tinta-500">
          Imprima e cole na mesa. O cliente aponta a câmera, o cardápio abre já no modo salão e
          o pedido sai na cozinha dizendo de qual mesa veio.
        </p>
      </div>

      <GestaoMesas mesas={comQr} nomeLoja={config.nome} />
    </>
  )
}
