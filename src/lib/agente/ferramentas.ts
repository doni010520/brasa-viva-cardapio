import { buscarBairros, buscarCardapio, buscarPedido } from '@/lib/dados'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { moeda } from '@/lib/format'
import { rotuloStatus } from '@/lib/types'
import { salvarConversa, type Conversa } from './estado'

/**
 * O que o agente PODE fazer.
 *
 * Repare no que NÃO está aqui: nada de montar carrinho, escolher endereço ou
 * fechar pedido. Pedido é sempre pelo site — é lá que o preço é conferido, o
 * pagamento acontece e o cliente vê o que está levando antes de confirmar.
 * O robô tira dúvida, dá notícia do pedido e manda o link.
 *
 * Isso encolhe o estrago possível de uma alucinação para o tamanho de uma
 * frase errada numa conversa, em vez de um pedido errado na cozinha.
 */

export type Ferramenta = {
  nome: string
  descricao: string
  parametros: Record<string, unknown>
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'definir_nome',
    descricao:
      'Guarda o nome do cliente quando ele se apresentar, para a equipe saber com quem fala.',
    parametros: {
      type: 'object',
      properties: { nome: { type: 'string' } },
      required: ['nome'],
    },
  },
  {
    nome: 'status_do_pedido',
    descricao:
      'Diz em que pé está o pedido mais recente deste telefone. Use quando perguntarem ' +
      '"cadê meu pedido", "já saiu?", "demora muito?".',
    parametros: { type: 'object', properties: {} },
  },
  {
    nome: 'chamar_atendente',
    descricao:
      'Passa a conversa para uma pessoa da equipe e para de responder. Use em reclamação, ' +
      'problema com pedido já feito, pedido de troca ou devolução, ou quando o cliente pedir ' +
      'para falar com gente de verdade.',
    parametros: {
      type: 'object',
      properties: { motivo: { type: 'string' } },
      required: ['motivo'],
    },
  },
]

export type ResultadoFerramenta = {
  /** Texto que volta para o modelo. Nunca vai direto para o cliente. */
  texto: string
  conversa: Conversa
  /** Fecha a rodada: nada mais deve ser dito depois disso. */
  encerra?: boolean
}

export async function executar(
  nome: string,
  argumentos: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  switch (nome) {
    case 'definir_nome':
      return definirNome(argumentos, conversa)
    case 'status_do_pedido':
      return statusDoPedido(conversa)
    case 'chamar_atendente':
      return chamarAtendente(argumentos, conversa)
    default:
      return { texto: `Ferramenta desconhecida: ${nome}`, conversa }
  }
}

async function definirNome(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  const nome = String(args.nome ?? '').trim().slice(0, 80)
  if (nome.length < 2) return { texto: 'Nome muito curto.', conversa }

  await salvarConversa(conversa.id, { nome })
  return { texto: `Anotado, o cliente se chama ${nome}.`, conversa: { ...conversa, nome } }
}

/**
 * Último pedido DESTE telefone, venha ele de onde vier.
 *
 * Busca pelo telefone e não por um id guardado na conversa: o pedido nasce no
 * site, então a conversa do WhatsApp não fica sabendo dele sozinha.
 */
async function statusDoPedido(conversa: Conversa): Promise<ResultadoFerramenta> {
  const supabase = criarClienteAdmin()

  const { data } = await supabase
    .from('pedidos')
    .select('id, numero, status, tipo_entrega, total_centavos, retirada_prevista, criado_em')
    .eq('cliente_id', await idDoCliente(conversa.telefone))
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return {
      texto:
        'Este telefone não tem pedido nenhum no sistema. Talvez a pessoa tenha pedido com ' +
        'outro número — convide a conferir, ou chame um atendente.',
      conversa,
    }
  }

  const pedido = await buscarPedido(data.id)
  const itens = (pedido?.itens ?? [])
    .map((i) => `${i.quantidade}x ${i.produto_nome}`)
    .join(', ')

  const numero = String(data.numero).padStart(3, '0')
  const base = process.env.NEXT_PUBLIC_URL_BASE?.replace(/\/$/, '')

  // guarda qual pedido é: a equipe vê isso no painel, e a próxima pergunta
  // ("e agora?") não precisa procurar de novo
  await salvarConversa(conversa.id, { ultimo_pedido_id: data.id })

  return {
    texto: [
      `Pedido #${numero}: ${rotuloStatus(data.status, data.tipo_entrega)}.`,
      itens ? `Itens: ${itens}.` : '',
      `Total ${moeda(data.total_centavos)}.`,
      base ? `Link para acompanhar: ${base}/pedido/${data.id}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    conversa: { ...conversa, ultimo_pedido_id: data.id },
  }
}

async function idDoCliente(telefone: string) {
  const { data } = await criarClienteAdmin()
    .from('clientes')
    .select('id')
    .eq('telefone', telefone)
    .maybeSingle()
  return data?.id ?? '00000000-0000-0000-0000-000000000000'
}

async function chamarAtendente(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  await salvarConversa(conversa.id, {
    humano_assumiu: true,
    humano_assumiu_em: new Date().toISOString(),
  } as Partial<Conversa>)

  console.warn(
    `[agente] conversa passada para humano — ${conversa.telefone}: ${String(args.motivo ?? '')}`
  )

  return {
    texto:
      'A conversa foi passada para a equipe. Avise o cliente que uma pessoa vai responder ' +
      'daqui a pouco e NÃO continue atendendo.',
    conversa: { ...conversa, humano_assumiu: true },
    encerra: true,
  }
}

// ---------------------------------------------------------------- resumos

/**
 * Cardápio em texto, para o robô saber o que a casa tem e quanto custa.
 *
 * Vai inteiro no prompt em vez de virar ferramenta de busca: a casa tem
 * poucas dezenas de itens, e ter tudo à vista corta uma ida e volta na API a
 * cada mensagem — o cliente sente isso na velocidade da resposta.
 *
 * Sem ids aqui: agora que o robô não monta carrinho, id só ocuparia espaço e
 * ainda arriscaria vazar para a conversa.
 */
export async function cardapioEmTexto(paraViagem: boolean): Promise<string> {
  const categorias = await buscarCardapio(false, paraViagem ? 'viagem' : 'local')
  const blocos: string[] = []

  for (const categoria of categorias) {
    if (categoria.produtos.length === 0) continue

    const itens = categoria.produtos.map((produto) => {
      const preco = produto.preco_promo_centavos ?? produto.preco_centavos
      const promo = produto.preco_promo_centavos
        ? ` (de ${moeda(produto.preco_centavos)} por ${moeda(preco)})`
        : ` ${moeda(preco)}`

      const opcionais = (produto.grupos_opcoes ?? [])
        .map((grupo) => {
          const opcoes = (grupo.opcoes ?? [])
            .filter((o) => o.disponivel)
            .map((o) => `${o.nome}${o.preco_extra_centavos ? ` +${moeda(o.preco_extra_centavos)}` : ''}`)
            .join(', ')
          return opcoes ? `    - ${grupo.nome}: ${opcoes}` : ''
        })
        .filter(Boolean)

      return [`  * ${produto.nome}${promo}`, ...opcionais].join('\n')
    })

    blocos.push(`${categoria.nome}:\n${itens.join('\n')}`)
  }

  return blocos.join('\n\n')
}

/** Bairros com taxa, para o agente não inventar área de entrega. */
export async function bairrosEmTexto(): Promise<string> {
  const bairros = await buscarBairros()
  if (bairros.length === 0) return 'A casa não faz entrega.'

  return bairros
    .map((b) => `- ${b.nome}: taxa ${moeda(b.taxa_centavos)}, ~${b.tempo_min} min`)
    .join('\n')
}
