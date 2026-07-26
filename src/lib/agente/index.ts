import { buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { mercadoPagoConfigurado } from '@/lib/mercadopago'
import { estadoDaLoja } from '@/lib/tempo'
import { moeda } from '@/lib/format'
import {
  FERRAMENTAS,
  bairrosEmTexto,
  cardapioEmTexto,
  executar,
  resumoDoCarrinho,
} from './ferramentas'
import { abrirConversa, anexarMensagem, salvarConversa, type Conversa } from './estado'
import { modeloPadrao, type Modelo, type Turno } from './modelo'

/**
 * O atendimento pelo WhatsApp.
 *
 * Divisão de trabalho: o modelo conversa e escolhe o que fazer; o sistema
 * confere e faz. Ele nunca soma, nunca decide taxa, nunca grava pedido — só
 * chama ferramenta. Se ele alucinar um prato, o pior que acontece é a
 * ferramenta recusar e ele ter que se explicar ao cliente.
 */

/** Trava contra laço infinito de ferramentas numa mesma mensagem. */
const MAX_RODADAS = 6

export type Atendimento = { respostas: string[]; conversa: Conversa }

export async function atender(
  telefoneNormalizado: string,
  textoDoCliente: string,
  modelo: Modelo | null = modeloPadrao()
): Promise<Atendimento> {
  const conversa = await abrirConversa(telefoneNormalizado)

  // Humano assumiu? A IA não volta sozinha. Quem devolve a conversa para ela
  // é o painel — senão o robô atropelaria a pessoa no meio do atendimento.
  if (conversa.humano_assumiu) {
    await salvarConversa(conversa.id, {
      mensagens: anexarMensagem(conversa, 'cliente', textoDoCliente),
    })
    return { respostas: [], conversa }
  }

  if (!modelo) {
    return {
      respostas: [],
      conversa,
    }
  }

  const sistema = await montarPrompt(conversa)

  const turnos: Turno[] = [
    ...conversa.mensagens.map((m) =>
      m.papel === 'cliente'
        ? ({ papel: 'cliente', texto: m.texto } as const)
        : ({ papel: 'agente', texto: m.texto } as const)
    ),
    { papel: 'cliente', texto: textoDoCliente },
  ]

  const respostas: string[] = []
  let atual = conversa

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const resposta = await modelo.responder({ sistema, turnos, ferramentas: FERRAMENTAS })

    if (resposta.texto) {
      respostas.push(resposta.texto)
      turnos.push({ papel: 'agente', texto: resposta.texto })
    }

    if (resposta.chamadas.length === 0) break

    let encerrou = false
    for (const chamada of resposta.chamadas) {
      const feito = await executar(chamada.nome, chamada.argumentos, atual)
      atual = feito.conversa
      turnos.push({ papel: 'ferramenta', nome: chamada.nome, resultado: feito.texto })
      if (feito.encerra) encerrou = true
    }
    if (encerrou) break
  }

  // Modelo mudo é pior que modelo errado: o cliente fica no vácuo.
  if (respostas.length === 0) {
    respostas.push('Opa! Me perdi aqui. Pode repetir, por favor?')
  }

  let mensagens = anexarMensagem(atual, 'cliente', textoDoCliente)
  for (const texto of respostas) {
    mensagens = anexarMensagem({ ...atual, mensagens }, 'agente', texto)
  }
  await salvarConversa(atual.id, { mensagens })

  return { respostas, conversa: { ...atual, mensagens } }
}

/**
 * O que o agente sabe antes de abrir a boca.
 *
 * Tudo aqui é lido do banco a cada mensagem: cardápio, preço, horário e o
 * carrinho de agora. Nada fica "decorado" entre uma conversa e outra — se o
 * dono esgotar um prato no painel, a próxima resposta já sai certa.
 */
async function montarPrompt(conversa: Conversa): Promise<string> {
  const [config, horarios] = await Promise.all([buscarConfiguracoes(), buscarHorarios()])
  const loja = estadoDaLoja(config, horarios)

  // Quem pede pelo WhatsApp está fora do salão: buffet livre não entra.
  const [cardapio, bairros, carrinho] = await Promise.all([
    cardapioEmTexto(true),
    bairrosEmTexto(),
    resumoDoCarrinho(conversa),
  ])

  const podePagarOnline = config.aceita_pagamento_online && mercadoPagoConfigurado()

  const regras = [
    `Você é ${config.agente_nome ?? 'o atendente'}, atendente virtual da ${config.nome} no WhatsApp.`,
    config.agente_instrucoes ?? '',
    '',
    'COMO FALAR',
    '- Mensagem de WhatsApp: curta, sem parágrafo enorme, sem markdown de título.',
    '- Uma pergunta por vez. Não despeje o cardápio inteiro; sugira o que combina.',
    '- Nunca invente prato, preço, taxa ou prazo. Se não está aqui embaixo, não existe.',
    '- Nunca repita id de produto para o cliente: id é coisa nossa.',
    '',
    'COMO FECHAR UM PEDIDO',
    '1. Monte o carrinho com adicionar_item.',
    '2. Confirme com o cliente o que tem no carrinho e o total.',
    '3. Pergunte o nome (definir_nome) se ainda não souber.',
    '4. Pergunte se é retirada ou entrega (definir_entrega). Para entrega, precisa de bairro, rua e número.',
    '5. Só então chame fechar_pedido.',
    '- Depois de fechar, mande para o cliente o número do pedido e o link que a ferramenta devolver.',
    '',
    'REGRAS DA CASA QUE NÃO SE NEGOCIAM',
    '- Entrega é SEMPRE paga pelo site, nunca em dinheiro na mão do entregador.',
    '  Quem quiser pagar em dinheiro ou maquininha retira no balcão.',
    podePagarOnline
      ? '- Pagamento online está disponível (Pix e cartão).'
      : '- O pagamento online ainda NÃO está ligado. Portanto só dá para fechar pedido de RETIRADA, pagando no balcão. Se pedirem entrega, explique isso com jeito.',
    config.pedido_minimo_centavos > 0
      ? `- Pedido mínimo: ${moeda(config.pedido_minimo_centavos)}.`
      : '',
    `- Preparo leva cerca de ${config.tempo_preparo_min} min.`,
    '- Reclamação, problema em pedido já entregue ou qualquer coisa fora de pedir comida: chame_atendente.',
    '',
    'AGORA',
    loja.aberta
      ? `- A loja está ABERTA${loja.horarioHoje ? ` (hoje ${loja.horarioHoje.abre} às ${loja.horarioHoje.fecha})` : ''}.`
      : `- A loja está FECHADA agora. ${loja.motivo ?? ''} Não dá para fechar pedido; avise e convide a voltar no horário.`,
    conversa.nome ? `- O cliente se chama ${conversa.nome}.` : '- Ainda não sabemos o nome do cliente.',
    conversa.tipo_entrega
      ? `- Já combinado: ${conversa.tipo_entrega}.`
      : '- Ainda não sabemos se é retirada ou entrega.',
    '',
    `CARRINHO AGORA\n${carrinho}`,
    '',
    `CARDÁPIO (use o id exato ao chamar ferramenta)\n${cardapio}`,
    '',
    `BAIRROS QUE ENTREGAMOS\n${bairros}`,
  ]

  return regras.filter((l) => l !== '').join('\n')
}

export { abrirConversa, normalizarTelefone } from './estado'
export type { Conversa } from './estado'
