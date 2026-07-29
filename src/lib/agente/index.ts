import { buscarBairros, buscarConfiguracoes, buscarHorarios } from '@/lib/dados'
import { estadoDaLoja } from '@/lib/tempo'
import { moeda } from '@/lib/format'
import { FERRAMENTAS, bairrosEmTexto, cardapioEmTexto, executar } from './ferramentas'
import { abrirConversa, anexarMensagem, salvarConversa, type Conversa } from './estado'
import { modeloDeIA, type Modelo, type Turno } from './modelo'
import { modeloSimples } from './modelo-simples'
import { urlBaseConfigurada } from '@/lib/url'

/**
 * O atendimento pelo WhatsApp.
 *
 * Não é um agente que faz coisas: é um chatbot que direciona para o site.
 * Pedido é sempre lá — é onde o preço é conferido, o pagamento acontece e o
 * cliente vê o que está levando antes de confirmar. Aqui ele tira dúvida, dá
 * notícia de pedido em andamento e manda o link.
 *
 * A IA é OPCIONAL. Sem chave de API, um punhado de regras responde o básico
 * na hora, de graça e sem alucinar (modelo-simples.ts). Com chave, a conversa
 * fica mais solta e ele entende pergunta torta. O sistema funciona inteiro
 * dos dois jeitos.
 */

/** Trava contra laço infinito de ferramentas numa mesma mensagem. */
const MAX_RODADAS = 4

export type Atendimento = { respostas: string[]; conversa: Conversa }

export async function atender(
  telefoneNormalizado: string,
  textoDoCliente: string,
  modeloEscolhido?: Modelo
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

  const modelo = modeloEscolhido ?? modeloDeIA() ?? modeloSimples(await contextoSimples(conversa))
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
 * Tudo aqui é lido do banco a cada mensagem: cardápio, preço e horário. Nada
 * fica "decorado" entre uma conversa e outra — se o dono esgotar um prato no
 * painel, a próxima resposta já sai certa.
 */
async function montarPrompt(conversa: Conversa): Promise<string> {
  const [config, horarios] = await Promise.all([buscarConfiguracoes(), buscarHorarios()])
  const loja = estadoDaLoja(config, horarios)

  // Quem fala pelo WhatsApp está fora do salão: buffet livre não entra.
  const [cardapio, bairros] = await Promise.all([cardapioEmTexto(true), bairrosEmTexto()])

  const link = urlBaseConfigurada()

  const regras = [
    `Você é ${config.agente_nome ?? 'o atendente'}, atendente virtual da ${config.nome} no WhatsApp.`,
    config.agente_instrucoes ?? '',
    '',
    'SUA FUNÇÃO',
    '- Tirar dúvida sobre cardápio, preço, horário e área de entrega.',
    '- Dar notícia de pedido em andamento (ferramenta status_do_pedido).',
    `- Levar quem quer pedir para o site: ${link || '(link do site)'}`,
    '',
    'VOCÊ NÃO ANOTA PEDIDO. NUNCA.',
    '- Não existe "anotei", "vou passar para a cozinha" nem "seu pedido é o número tal".',
    '- Se a pessoa listar o que quer, tudo bem responder o que é e quanto custa —',
    '  mas termine mandando o link para ela fechar por lá.',
    '- O motivo é bom e pode ser dito: no site ela confere tudo, escolhe como pagar',
    '  e recebe o comprovante. É o que evita pedido trocado.',
    '- Se insistir muito em fechar por aqui, chame um atendente.',
    '',
    'COMO FALAR',
    '- Mensagem de WhatsApp: curta, sem parágrafo enorme, sem markdown de título.',
    '- Uma pergunta por vez. Não despeje o cardápio inteiro; sugira o que combina.',
    '- Nunca invente prato, preço, taxa ou prazo. Se não está aqui embaixo, não existe.',
    '',
    'REGRAS DA CASA',
    '- Entrega é sempre paga pelo site. Quem quiser pagar em dinheiro ou maquininha',
    '  retira no balcão.',
    config.pedido_minimo_centavos > 0
      ? `- Pedido mínimo: ${moeda(config.pedido_minimo_centavos)}.`
      : '',
    `- Preparo leva cerca de ${config.tempo_preparo_min} min.`,
    '- Comida no quilo é só no balcão do restaurante, não dá para pedir pelo site.',
    '- Reclamação, problema em pedido já entregue, troca ou devolução: chamar_atendente.',
    '',
    'AGORA',
    loja.aberta
      ? `- A loja está ABERTA${loja.horarioHoje ? ` (hoje ${loja.horarioHoje.abre} às ${loja.horarioHoje.fecha})` : ''}.`
      : `- A loja está FECHADA agora. ${loja.motivo ?? ''} Avise e convide a voltar no horário.`,
    conversa.nome
      ? `- O cliente se chama ${conversa.nome}.`
      : '- Ainda não sabemos o nome do cliente.',
    '',
    `CARDÁPIO DE HOJE\n${cardapio}`,
    '',
    `BAIRROS QUE ENTREGAMOS\n${bairros}`,
  ]

  return regras.filter((l) => l !== '').join('\n')
}

/** O que o chatbot sem IA precisa saber para responder. */
async function contextoSimples(conversa: Conversa) {
  const [config, horarios, bairros] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
    buscarBairros(),
  ])
  const loja = estadoDaLoja(config, horarios)

  return {
    nomeLoja: config.nome,
    link: urlBaseConfigurada(),
    aberta: loja.aberta,
    motivoFechada: loja.motivo ?? null,
    horarioHoje: loja.horarioHoje
      ? { abre: loja.horarioHoje.abre, fecha: loja.horarioHoje.fecha }
      : null,
    bairros: bairros.map((b) => ({ nome: b.nome, taxa: moeda(b.taxa_centavos) })),
    tempoPreparoMin: config.tempo_preparo_min,
    // primeira mensagem da conversa: vale se apresentar
    primeiraVez: conversa.mensagens.length === 0,
  }
}

export { abrirConversa, normalizarTelefone } from './estado'
export type { Conversa } from './estado'
