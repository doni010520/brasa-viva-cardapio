'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, Store, UtensilsCrossed } from 'lucide-react'
import { escolherModoAction } from '@/app/(loja)/acoes-modo'
import type { ModoConsumo } from '@/lib/types'

/**
 * Primeira pergunta do site. O cardápio depende dela: buffet livre só faz
 * sentido para quem está no salão, marmita embalada só para quem vai levar.
 *
 * As fotos da casa ocupam a tela inteira por baixo de uma camada preta. É o
 * que faz o cliente reconhecer onde entrou antes de ler qualquer coisa — e a
 * camada é o que mantém o texto legível por cima de foto de celular, que vem
 * com brilho e contraste imprevisíveis.
 */
export function EscolhaModo({
  nomeLoja,
  descricao,
  fachadaUrl,
  aceitaLocal,
  aceitaRetirada,
  aceitaEntrega,
  precoBuffetCentavos,
}: {
  nomeLoja: string
  descricao: string | null
  fachadaUrl: string
  aceitaLocal: boolean
  aceitaRetirada: boolean
  aceitaEntrega: boolean
  precoBuffetCentavos: number | null
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()

  function escolher(modo: ModoConsumo) {
    salvar(async () => {
      await escolherModoAction(modo)
      router.refresh()
    })
  }

  const podeViagem = aceitaRetirada || aceitaEntrega

  return (
    // -mx-4 fura o respiro lateral do layout; -mt-px cobre a emenda com o
    // cabeçalho preto, que em alguns celulares deixava uma linha clara.
    <section className="bg-carvao-900 relative -mx-4 -mt-px flex min-h-[calc(100dvh-8.5rem)] flex-col justify-center overflow-hidden px-5 py-10">
      <div aria-hidden className="absolute inset-0">
        {/* É o maior elemento da primeira tela (LCP): sem a prioridade alta o
            navegador só descobre a foto tarde demais e o site parece lento. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fachadaUrl}
          alt=""
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
        {/* A camada preta tem duas partes: uma chapada, que garante contraste
            mínimo em qualquer foto — inclusive nas que o dono subir depois —,
            e um degradê que fecha as pontas sem apagar a foto no meio. */}
        <div className="bg-carvao-900/65 absolute inset-0" />
        <div className="from-carvao-900/55 via-carvao-900/30 to-carvao-900/80 absolute inset-0 bg-gradient-to-b" />
      </div>

      <div className="relative">
        <div className="text-center">
          <h1 className="text-3xl leading-tight font-black tracking-tight text-white drop-shadow-lg">
            {nomeLoja}
          </h1>
          {descricao && <p className="mt-1.5 text-sm text-white/70">{descricao}</p>}
        </div>

        <div className="mt-10 text-center">
          <p className="text-lg font-bold text-white">Você está no restaurante agora?</p>
          <p className="mt-0.5 text-sm text-white/60">O cardápio muda conforme a sua resposta.</p>
        </div>

        <div className="mt-5 space-y-3">
          {aceitaLocal && (
            <Opcao
              aoEscolher={() => escolher('local')}
              carregando={salvando}
              icone={<UtensilsCrossed className="h-6 w-6" />}
              titulo="Sim, estou no restaurante"
              descricao={
                precoBuffetCentavos
                  ? 'Buffet livre e bebidas servidos na mesa. Pague pelo celular e sirva-se.'
                  : 'Peça da mesa e pague pelo celular, sem fila no caixa.'
              }
              // vermelho e amarelo são o código de cor do sistema inteiro:
              // é o mesmo par que a faixa de contexto usa nas outras telas
              tom="restaurante"
            />
          )}

          {podeViagem && (
            <Opcao
              aoEscolher={() => escolher('viagem')}
              carregando={salvando}
              icone={aceitaEntrega ? <Bike className="h-6 w-6" /> : <Store className="h-6 w-6" />}
              titulo={
                aceitaEntrega && aceitaRetirada
                  ? 'Não, é para viagem'
                  : aceitaEntrega
                    ? 'Não, é para entrega'
                    : 'Não, é para retirada'
              }
              descricao={
                aceitaEntrega && aceitaRetirada
                  ? 'Marmitas, porções e bebidas para receber em casa ou buscar no balcão.'
                  : aceitaEntrega
                    ? 'Marmitas, porções e bebidas entregues no seu endereço.'
                    : 'Marmitas, porções e bebidas para buscar no balcão.'
              }
              tom="viagem"
            />
          )}
        </div>

        {aceitaLocal && (
          <p className="mt-6 text-center text-xs text-white/50">
            Comida no quilo é direto no balcão: sirva-se e pese na hora, sem precisar pedir por
            aqui.
          </p>
        )}
      </div>
    </section>
  )
}

function Opcao({
  aoEscolher,
  carregando,
  icone,
  titulo,
  descricao,
  tom,
}: {
  aoEscolher: () => void
  carregando: boolean
  icone: React.ReactNode
  titulo: string
  descricao: string
  tom: 'restaurante' | 'viagem'
}) {
  const noRestaurante = tom === 'restaurante'

  return (
    <button
      onClick={aoEscolher}
      disabled={carregando}
      className={`flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-lg transition active:scale-[0.99] disabled:opacity-60 ${
        noRestaurante
          ? 'bg-marca hover:bg-marca-600 text-white'
          : 'bg-amber-400 text-carvao-900 hover:bg-amber-300'
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          noRestaurante ? 'bg-white/20 text-white' : 'bg-carvao-900/10 text-carvao-900'
        }`}
      >
        {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : icone}
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{titulo}</span>
        {/* branco cheio: a 80% sobre o vermelho da marca faltava contraste */}
        <span className={`block text-sm ${noRestaurante ? 'text-white' : 'text-carvao-900/70'}`}>
          {descricao}
        </span>
      </span>
    </button>
  )
}
