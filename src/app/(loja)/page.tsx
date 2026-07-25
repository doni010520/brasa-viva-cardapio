import { Cardapio } from '@/components/loja/cardapio'
import { buscarCardapio, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { estadoDaLoja } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function PaginaCardapio() {
  const [categorias, config, horarios] = await Promise.all([
    buscarCardapio(),
    buscarConfiguracoes(),
    buscarHorarios(),
  ])
  const loja = estadoDaLoja(config, horarios)

  return (
    <>
      <section className="py-6">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">{config.nome}</h1>
        {config.descricao && <p className="mt-1 text-tinta-500">{config.descricao}</p>}
        {!loja.aberta && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong className="font-semibold">Estamos fechados. </strong>
            {loja.motivo} Você pode montar seu pedido, mas só conseguirá finalizar quando
            reabrirmos.
          </div>
        )}
      </section>

      <Cardapio categorias={categorias} lojaAberta={loja.aberta} />
    </>
  )
}
