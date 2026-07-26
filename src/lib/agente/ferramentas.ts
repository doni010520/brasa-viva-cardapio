import { buscarBairros, buscarCardapio, buscarConfiguracoes, buscarPedido } from '@/lib/dados'
import { conferirItens } from '@/lib/montar-pedido'
import { criarPedido } from '@/lib/criar-pedido'
import { criarClienteAdmin } from '@/lib/supabase/server'
import { moeda } from '@/lib/format'
import { rotuloStatus } from '@/lib/types'
import { salvarConversa, type Conversa, type ItemDoCarrinho } from './estado'

/**
 * O que o agente PODE fazer.
 *
 * Nenhuma ferramenta recebe preço, taxa ou total: o modelo só escolhe ids e
 * quantidades. Toda conta sai do banco, pelo mesmo caminho do site. É o que
 * garante que uma alucinação vire, no pior caso, um item errado no carrinho —
 * e nunca um valor errado cobrado do cliente.
 */

export type Ferramenta = {
  nome: string
  descricao: string
  parametros: Record<string, unknown>
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'adicionar_item',
    descricao:
      'Põe um item no carrinho do cliente. Use o id exato do produto que está no cardápio. ' +
      'Se o produto tiver grupo de opções obrigatório, mande as opções escolhidas.',
    parametros: {
      type: 'object',
      properties: {
        produto_id: { type: 'string', description: 'id do produto, copiado do cardápio' },
        quantidade: { type: 'integer', minimum: 1, maximum: 20 },
        opcao_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'ids das opções escolhidas (ponto da carne, adicionais...)',
        },
        observacao: { type: 'string', description: 'ex.: sem cebola' },
      },
      required: ['produto_id', 'quantidade'],
    },
  },
  {
    nome: 'remover_item',
    descricao: 'Tira um item do carrinho pela posição que aparece na lista (1 é o primeiro).',
    parametros: {
      type: 'object',
      properties: { posicao: { type: 'integer', minimum: 1 } },
      required: ['posicao'],
    },
  },
  {
    nome: 'limpar_carrinho',
    descricao: 'Esvazia o carrinho. Use quando o cliente desistir de tudo e quiser recomeçar.',
    parametros: { type: 'object', properties: {} },
  },
  {
    nome: 'definir_entrega',
    descricao:
      'Guarda como o cliente vai receber. Para entrega, o bairro precisa ser um dos que a casa atende.',
    parametros: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['retirada', 'entrega'] },
        bairro_id: { type: 'string', description: 'obrigatório quando tipo = entrega' },
        rua: { type: 'string' },
        numero: { type: 'string' },
        complemento: { type: 'string' },
        referencia: { type: 'string', description: 'ponto de referência para o entregador' },
      },
      required: ['tipo'],
    },
  },
  {
    nome: 'definir_nome',
    descricao: 'Guarda o nome do cliente, para chamar a pessoa no balcão.',
    parametros: {
      type: 'object',
      properties: { nome: { type: 'string' } },
      required: ['nome'],
    },
  },
  {
    nome: 'fechar_pedido',
    descricao:
      'Fecha o pedido de verdade e manda para a cozinha. Só chame depois de o cliente confirmar ' +
      'o que vai levar, o nome, e como recebe. Devolve o número do pedido e o total.',
    parametros: {
      type: 'object',
      properties: {
        forma_pagamento: {
          type: 'string',
          enum: ['online', 'local'],
          description: 'local = paga no balcão ao retirar. Entrega SÓ aceita online.',
        },
        observacoes: { type: 'string', description: 'recado geral para a cozinha' },
      },
      required: ['forma_pagamento'],
    },
  },
  {
    nome: 'status_do_pedido',
    descricao: 'Diz em que pé está o último pedido deste cliente.',
    parametros: { type: 'object', properties: {} },
  },
  {
    nome: 'chamar_atendente',
    descricao:
      'Passa a conversa para uma pessoa da equipe. Use em reclamação, problema com pedido ' +
      'já feito, ou quando o cliente pedir para falar com gente de verdade.',
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
  /** Conversa já atualizada, quando a ferramenta mexeu no estado. */
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
    case 'adicionar_item':
      return adicionarItem(argumentos, conversa)
    case 'remover_item':
      return removerItem(argumentos, conversa)
    case 'limpar_carrinho':
      return limparCarrinho(conversa)
    case 'definir_entrega':
      return definirEntrega(argumentos, conversa)
    case 'definir_nome':
      return definirNome(argumentos, conversa)
    case 'fechar_pedido':
      return fecharPedido(argumentos, conversa)
    case 'status_do_pedido':
      return statusDoPedido(conversa)
    case 'chamar_atendente':
      return chamarAtendente(argumentos, conversa)
    default:
      return { texto: `Ferramenta desconhecida: ${nome}`, conversa }
  }
}

// ---------------------------------------------------------------- carrinho

async function adicionarItem(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  const produtoId = String(args.produto_id ?? '')
  const quantidade = Math.max(1, Math.min(20, Number(args.quantidade ?? 1)))
  const opcaoIds = Array.isArray(args.opcao_ids) ? args.opcao_ids.map(String) : []
  const observacao = args.observacao ? String(args.observacao).slice(0, 200) : undefined

  const item: ItemDoCarrinho = { produtoId, quantidade, opcaoIds, observacao }

  // Confere ANTES de guardar: item inválido não entra no carrinho, senão o
  // erro só apareceria lá na frente, na hora de fechar.
  const conferencia = await conferirItens([item])
  if (!conferencia.ok) {
    return { texto: `NÃO ADICIONADO. ${conferencia.erro}`, conversa }
  }

  const carrinho = [...conversa.carrinho, item]
  await salvarConversa(conversa.id, { carrinho })
  const atualizada = { ...conversa, carrinho }

  return { texto: await resumoDoCarrinho(atualizada), conversa: atualizada }
}

async function removerItem(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  const posicao = Number(args.posicao ?? 0)
  if (!Number.isInteger(posicao) || posicao < 1 || posicao > conversa.carrinho.length) {
    return { texto: `Não existe item na posição ${posicao}.`, conversa }
  }

  const carrinho = conversa.carrinho.filter((_, i) => i !== posicao - 1)
  await salvarConversa(conversa.id, { carrinho })
  const atualizada = { ...conversa, carrinho }

  return { texto: await resumoDoCarrinho(atualizada), conversa: atualizada }
}

async function limparCarrinho(conversa: Conversa): Promise<ResultadoFerramenta> {
  await salvarConversa(conversa.id, { carrinho: [] })
  return { texto: 'Carrinho vazio.', conversa: { ...conversa, carrinho: [] } }
}

// ---------------------------------------------------------------- entrega

async function definirEntrega(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  const tipo = args.tipo === 'entrega' ? 'entrega' : 'retirada'
  const config = await buscarConfiguracoes()

  if (tipo === 'entrega' && !config.aceita_entrega) {
    return { texto: 'A casa não está entregando agora. Só retirada no balcão.', conversa }
  }
  if (tipo === 'retirada' && !config.aceita_retirada) {
    return { texto: 'A casa não está com retirada no balcão agora.', conversa }
  }

  if (tipo === 'retirada') {
    const mudancas = { tipo_entrega: 'retirada' as const, bairro_id: null }
    await salvarConversa(conversa.id, mudancas)
    return { texto: 'Anotado: retirada no balcão, sem taxa.', conversa: { ...conversa, ...mudancas } }
  }

  const bairros = await buscarBairros()
  const bairro = bairros.find((b) => b.id === String(args.bairro_id ?? ''))
  if (!bairro) {
    const lista = bairros.map((b) => `${b.nome} (id ${b.id})`).join('; ')
    return { texto: `Bairro inválido. Os que atendemos são: ${lista}`, conversa }
  }

  const rua = args.rua ? String(args.rua).slice(0, 120) : null
  const numero = args.numero ? String(args.numero).slice(0, 20) : null
  if (!rua || !numero) {
    return { texto: 'Falta a rua e o número para entregar. Pergunte ao cliente.', conversa }
  }

  const mudancas = {
    tipo_entrega: 'entrega' as const,
    bairro_id: bairro.id,
    endereco_rua: rua,
    endereco_numero: numero,
    endereco_complemento: args.complemento ? String(args.complemento).slice(0, 80) : null,
    endereco_referencia: args.referencia ? String(args.referencia).slice(0, 120) : null,
  }
  await salvarConversa(conversa.id, mudancas)

  return {
    texto:
      `Anotado: entrega em ${bairro.nome}, ${rua}, ${numero}. ` +
      `Taxa ${moeda(bairro.taxa_centavos)}, mais ou menos ${bairro.tempo_min} min.`,
    conversa: { ...conversa, ...mudancas },
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

// ------------------------------------------------------------ fechamento

async function fecharPedido(
  args: Record<string, unknown>,
  conversa: Conversa
): Promise<ResultadoFerramenta> {
  if (conversa.carrinho.length === 0) {
    return { texto: 'Carrinho vazio: não há o que fechar.', conversa }
  }
  if (!conversa.nome) {
    return { texto: 'Falta o nome do cliente. Pergunte antes de fechar.', conversa }
  }
  if (!conversa.tipo_entrega) {
    return { texto: 'Falta saber se é retirada ou entrega. Pergunte antes de fechar.', conversa }
  }

  const formaPagamento = args.forma_pagamento === 'online' ? 'online' : 'local'

  const resposta = await criarPedido({
    nome: conversa.nome,
    telefone: conversa.telefone,
    observacoes: args.observacoes ? String(args.observacoes).slice(0, 300) : undefined,
    formaPagamento,
    tipoEntrega: conversa.tipo_entrega,
    itens: conversa.carrinho.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      opcaoIds: i.opcaoIds,
      observacao: i.observacao,
    })),
    bairroId: conversa.bairro_id,
    enderecoRua: conversa.endereco_rua ?? undefined,
    enderecoNumero: conversa.endereco_numero ?? undefined,
    enderecoComplemento: conversa.endereco_complemento ?? undefined,
    enderecoReferencia: conversa.endereco_referencia ?? undefined,
  })

  if (!resposta.ok) return { texto: `NÃO FECHOU. ${resposta.erro}`, conversa }

  // Carrinho zerado: sem isso, um "quero mais um" viraria pedido em dobro.
  const mudancas = { carrinho: [], ultimo_pedido_id: resposta.pedidoId }
  await salvarConversa(conversa.id, mudancas)

  const base = process.env.NEXT_PUBLIC_URL_BASE?.replace(/\/$/, '') ?? ''
  const linkPagamento = base ? `${base}/pedido/${resposta.pedidoId}/pagamento` : null
  const linkAcompanhar = base ? `${base}/pedido/${resposta.pedidoId}` : null

  const numero = String(resposta.numero).padStart(3, '0')
  const partes = [
    `PEDIDO FECHADO. Número #${numero}. Total ${moeda(resposta.totalCentavos)}.`,
    formaPagamento === 'local'
      ? 'Paga no balcão na hora de retirar. Já entrou na fila da cozinha.'
      : `Falta pagar. Mande este link para o cliente pagar: ${linkPagamento}`,
    linkAcompanhar ? `Link para acompanhar: ${linkAcompanhar}` : '',
  ].filter(Boolean)

  return {
    texto: partes.join(' '),
    conversa: { ...conversa, ...mudancas } as Conversa,
  }
}

async function statusDoPedido(conversa: Conversa): Promise<ResultadoFerramenta> {
  if (!conversa.ultimo_pedido_id) {
    return { texto: 'Este cliente não tem pedido recente por aqui.', conversa }
  }

  const pedido = await buscarPedido(conversa.ultimo_pedido_id)
  if (!pedido) return { texto: 'Não achei o pedido.', conversa }

  const numero = String(pedido.numero).padStart(3, '0')
  return {
    texto:
      `Pedido #${numero}: ${rotuloStatus(pedido.status, pedido.tipo_entrega)}. ` +
      `Total ${moeda(pedido.total_centavos)}.`,
    conversa,
  }
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

/** Carrinho com os preços do BANCO — é o que o modelo pode repetir ao cliente. */
export async function resumoDoCarrinho(conversa: Conversa): Promise<string> {
  if (conversa.carrinho.length === 0) return 'Carrinho vazio.'

  const conferencia = await conferirItens(conversa.carrinho)
  if (!conferencia.ok) return `Carrinho com problema: ${conferencia.erro}`

  const linhas = conferencia.linhas.map((linha, i) => {
    const opcoes = (linha.opcoes as { nome: string }[] | null) ?? []
    const extras = opcoes.length ? ` (${opcoes.map((o) => o.nome).join(', ')})` : ''
    const obs = linha.observacao ? ` — obs: ${linha.observacao}` : ''
    return `${i + 1}. ${linha.quantidade}x ${linha.produto_nome}${extras}${obs} = ${moeda(
      linha.total_centavos
    )}`
  })

  return `Carrinho:\n${linhas.join('\n')}\nSubtotal ${moeda(conferencia.subtotalCentavos)}`
}

/**
 * Cardápio em texto, com os ids que o modelo precisa copiar.
 *
 * Vai inteiro no prompt em vez de virar ferramenta de busca: a casa tem
 * poucas dezenas de itens, e ter o cardápio à vista corta uma ida e volta na
 * API a cada mensagem — o cliente sente isso na velocidade da resposta.
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

      const grupos = (produto.grupos_opcoes ?? []).map((grupo) => {
        const obrigatorio = grupo.min_escolhas > 0 ? 'obrigatório' : 'opcional'
        const opcoes = (grupo.opcoes ?? [])
          .filter((o) => o.disponivel)
          .map(
            (o) =>
              `${o.nome}${o.preco_extra_centavos ? ` +${moeda(o.preco_extra_centavos)}` : ''} [id ${o.id}]`
          )
          .join(', ')
        return `    - ${grupo.nome} (${obrigatorio}, escolhe de ${grupo.min_escolhas} a ${grupo.max_escolhas}): ${opcoes}`
      })

      return [`  * ${produto.nome}${promo} [id ${produto.id}]`, ...grupos].join('\n')
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
    .map((b) => `- ${b.nome}: taxa ${moeda(b.taxa_centavos)}, ~${b.tempo_min} min [id ${b.id}]`)
    .join('\n')
}

/** Usado pelo painel para mostrar a conversa sem chamar modelo nenhum. */
export async function pedidoDaConversa(conversa: Conversa) {
  if (!conversa.ultimo_pedido_id) return null
  return criarClienteAdmin()
    .from('pedidos')
    .select('id, numero, status, total_centavos')
    .eq('id', conversa.ultimo_pedido_id)
    .maybeSingle()
    .then((r) => r.data)
}
