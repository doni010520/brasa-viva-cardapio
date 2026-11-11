import { ConfigFiscal, type SituacaoCertificado } from '@/components/admin/config-fiscal'
import { FormularioConfig } from '@/components/admin/formulario-config'
import { carregarCertificado, certificadoConfigurado } from '@/lib/nfce/certificado'
import { pendenciasNfce } from '@/lib/nfce/emitir'
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

  // só o resumo do certificado vai pra tela; chave e senha nunca saem do servidor
  let certificado: SituacaoCertificado = { estado: 'ausente' }
  if (certificadoConfigurado()) {
    try {
      const c = carregarCertificado()
      certificado = {
        estado: 'ok',
        titular: c.titular,
        cnpj: c.cnpj,
        validoAte: c.validoAte.toISOString(),
        cnpjBate: !c.cnpj || c.cnpj === (config.cnpj ?? '').replace(/\D/g, ''),
      }
    } catch (e) {
      certificado = { estado: 'invalido', erro: e instanceof Error ? e.message : String(e) }
    }
  }

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

      <ConfigFiscal
        config={config}
        certificado={certificado}
        cscConfigurado={Boolean(process.env.NFCE_CSC_ID && process.env.NFCE_CSC_TOKEN)}
        pendencias={pendenciasNfce(config)}
      />
    </>
  )
}
