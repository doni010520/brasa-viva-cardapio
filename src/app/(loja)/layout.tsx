import Link from 'next/link'
import { Camera, Lock, MapPin, Phone, Receipt } from 'lucide-react'
import { ProvedorCarrinho } from '@/components/carrinho-contexto'
import { BotaoCarrinho } from '@/components/loja/botao-carrinho'
import { FaixaModo } from '@/components/loja/faixa-modo'
import { Marca } from '@/components/marca'
import { buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { mesaAtual, modoAtual } from '@/lib/modo'
import { estadoDaLoja } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function LayoutLoja({ children }: { children: React.ReactNode }) {
  const [config, horarios, modo, mesa] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    modoAtual(),
    mesaAtual(),
  ])
  const loja = estadoDaLoja(config, horarios)

  // a casa atende dos dois jeitos? então vale avisar em qual deles a pessoa está
  const podeTrocar = config.aceita_consumo_local && (config.aceita_retirada || config.aceita_entrega)

  return (
    <ProvedorCarrinho>
      <div
        className="flex min-h-dvh flex-col"
        style={{ '--marca': config.cor_primaria } as React.CSSProperties}
      >
        <header className="sticky top-0 z-30 border-b border-white/10 bg-carvao-900">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="min-w-0">
              <Marca nome={config.nome} logoUrl={config.logo_url} />
            </Link>
            <BotaoCarrinho />
          </div>

          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-3 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                loja.aberta ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-tinta-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  loja.aberta ? 'bg-emerald-400' : 'bg-tinta-400'
                }`}
              />
              {loja.aberta ? 'Aberto agora' : 'Fechado'}
            </span>
            {loja.horarioHoje && (
              <span className="text-tinta-400">
                Hoje {loja.horarioHoje.abre} às {loja.horarioHoje.fecha}
              </span>
            )}
            {!loja.aberta && loja.motivo && <span className="text-tinta-400">{loja.motivo}</span>}
          </div>

          {/* Faixa de contexto: acompanha o cliente em todas as telas para
              ele nunca fechar um pedido no modo errado. */}
          {modo && podeTrocar && (
            <FaixaModo modo={modo} mesa={modo === 'local' ? mesa : null} />
          )}
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28">{children}</main>

        <footer className="border-t border-tinta-200 bg-white px-4 py-8 text-sm text-tinta-500">
          <div className="mx-auto max-w-3xl space-y-2">
            <p className="font-semibold text-tinta-700">{config.nome}</p>
            {config.endereco &&
              (config.endereco_url ? (
                <a
                  href={config.endereco_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 font-medium text-tinta-600 hover:text-tinta-900"
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  {config.endereco}
                </a>
              ) : (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {config.endereco}
                </p>
              ))}
            {config.telefone &&
              (config.whatsapp ? (
                <a
                  href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 font-medium text-tinta-600 hover:text-tinta-900"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  {config.telefone}
                </a>
              ) : (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  {config.telefone}
                </p>
              ))}
            {config.instagram_url && (
              <a
                href={config.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 pt-1 font-medium text-tinta-600 hover:text-tinta-900"
              >
                <Camera className="h-4 w-4 shrink-0" />
                Siga a gente no Instagram
              </a>
            )}

            <div className="pt-3">
              <Link
                href="/meus-pedidos"
                className="inline-flex items-center gap-2 font-medium text-tinta-600 hover:text-tinta-900"
              >
                <Receipt className="h-4 w-4 shrink-0" />
                Meus pedidos
              </Link>
            </div>

            <div className="pt-4">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-xl border border-tinta-200 bg-white px-4 py-2.5 text-sm font-semibold text-tinta-600 transition hover:border-tinta-300 hover:text-tinta-900"
              >
                <Lock className="h-4 w-4" />
                Acesso da equipe
              </Link>
              <p className="mt-1.5 text-xs text-tinta-400">
                Só para quem trabalha na {config.nome}.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </ProvedorCarrinho>
  )
}
