import { Cardapio } from '@/components/loja/cardapio'
import { EscolhaModo } from '@/components/loja/escolha-modo'
import { buscarCardapio, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { modoAtual } from '@/lib/modo'
import { estadoDaLoja } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

export default async function PaginaCardapio() {
  const [config, horarios, modo] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    modoAtual(),
  ])

  const loja = estadoDaLoja(config, horarios)
  const podeViagem = config.aceita_retirada || config.aceita_entrega

  // Ainda não sabemos onde a pessoa vai comer: pergunta antes de mostrar preço.
  // Se a casa só atende de um jeito, não faz sentido perguntar.
  const precisaEscolher = !modo && config.aceita_consumo_local && podeViagem

  if (precisaEscolher) {
    const buffet = await buscarCardapio(false, 'local')
    const precoBuffet =
      buffet.flatMap((c) => c.produtos).find((p) => p.modo_consumo === 'so_local')
        ?.preco_centavos ?? null

    return (
      <EscolhaModo
        nomeLoja={config.nome}
        descricao={config.descricao}
        fachadaUrl={config.foto_fachada_url ?? '/fachada.webp'}
        aceitaLocal={config.aceita_consumo_local}
        aceitaRetirada={config.aceita_retirada}
        aceitaEntrega={config.aceita_entrega}
        precoBuffetCentavos={precoBuffet}
      />
    )
  }

  // sem escolha possível, assume o único jeito que a casa atende
  const modoEfetivo = modo ?? (config.aceita_consumo_local && !podeViagem ? 'local' : 'viagem')
  const categorias = await buscarCardapio(false, modoEfetivo)

  return (
    <>
      <section className="pt-5 pb-2">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">{config.nome}</h1>
        {config.descricao && <p className="mt-1 text-tinta-500">{config.descricao}</p>}

        {modoEfetivo === 'local' && (
          <p className="mt-3 rounded-2xl bg-tinta-100 px-4 py-3 text-sm text-tinta-600">
            Comida <strong>no quilo</strong> é direto no balcão: sirva-se e pese na hora. Por
            aqui você paga o buffet livre e as bebidas da sua mesa.
          </p>
        )}

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
