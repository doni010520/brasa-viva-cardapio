import type { Modelo, Resposta, Turno } from './modelo'

/**
 * O chatbot sem IA.
 *
 * A função dele é uma só: responder o básico na hora e empurrar para o site.
 * Como isso cabe em meia dúzia de regras, não precisa de modelo de linguagem
 * nenhum — e sem modelo não há chave de API, não há custo por mensagem, não
 * há alucinação e não há espera de dois segundos para responder "peça aqui".
 *
 * A IA, quando o dono ligar uma chave, entra como MELHORIA: entende a pergunta
 * torta, conversa mais solto. Mas o sistema funciona inteiro sem ela.
 */

type Assunto = {
  nome: string
  /** Sem acento e em minúsculas — a comparação normaliza os dois lados. */
  gatilhos: string[]
  responder: (contexto: ContextoSimples) => Resposta
}

export type ContextoSimples = {
  nomeLoja: string
  link: string
  aberta: boolean
  motivoFechada: string | null
  horarioHoje: { abre: string; fecha: string } | null
  bairros: { nome: string; taxa: string }[]
  tempoPreparoMin: number
  primeiraVez: boolean
}

function semAcento(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const ASSUNTOS: Assunto[] = [
  {
    nome: 'atendente',
    gatilhos: [
      'atendente',
      'humano',
      'pessoa',
      'falar com alguem',
      'reclamacao',
      'reclamar',
      'problema',
      'errado',
      'faltou',
      'cancelar',
      'estorno',
      'devolucao',
    ],
    responder: () => ({
      texto: 'Já estou chamando alguém da equipe para falar com você. Um instante!',
      chamadas: [{ nome: 'chamar_atendente', argumentos: { motivo: 'cliente pediu atendimento' } }],
    }),
  },
  {
    nome: 'status',
    gatilhos: [
      'cade meu pedido',
      'meu pedido',
      'ja saiu',
      'saiu para entrega',
      'status',
      'demora',
      'ta demorando',
      'quanto tempo',
      'acompanhar',
    ],
    responder: () => ({ texto: '', chamadas: [{ nome: 'status_do_pedido', argumentos: {} }] }),
  },
  {
    nome: 'horario',
    gatilhos: ['horario', 'que horas', 'abre', 'fecha', 'aberto', 'funciona', 'domingo', 'hoje'],
    responder: (c) => ({
      texto: c.aberta
        ? `Estamos abertos agora${c.horarioHoje ? `, até as ${c.horarioHoje.fecha}` : ''}. ` +
          `Para pedir é por aqui: ${c.link}`
        : `Agora estamos fechados.${c.motivoFechada ? ` ${c.motivoFechada}` : ''} ` +
          `O cardápio fica sempre no ar: ${c.link}`,
      chamadas: [],
    }),
  },
  {
    nome: 'entrega',
    gatilhos: ['entrega', 'entregam', 'delivery', 'taxa', 'bairro', 'leva ate', 'frete'],
    responder: (c) => ({
      texto:
        c.bairros.length > 0
          ? `A gente entrega em: ${c.bairros.map((b) => `${b.nome} (${b.taxa})`).join(', ')}.\n\n` +
            `É só escolher o bairro na hora de fechar: ${c.link}`
          : `No momento a gente não está entregando, só retirada no balcão. Peça por aqui: ${c.link}`,
      chamadas: [],
    }),
  },
  {
    nome: 'cardapio',
    gatilhos: [
      'cardapio',
      'menu',
      'preco',
      'quanto custa',
      'quanto e',
      'tem o que',
      'o que tem',
      'marmita',
      'almoco',
      'comida',
      'pedir',
      'pedido',
      'quero',
      'fazer um pedido',
      'link',
    ],
    responder: (c) => ({
      texto:
        `O cardápio de hoje com os preços está aqui: ${c.link}\n\n` +
        `É só montar o pedido, escolher se vai buscar ou receber em casa, e pagar por lá. ` +
        `Fica pronto em uns ${c.tempoPreparoMin} minutinhos.`,
      chamadas: [],
    }),
  },
]

/**
 * A resposta padrão, e a mais importante: é ela que aparece quando o cliente
 * escreve qualquer coisa fora do previsto. Ela nunca pode deixar a pessoa sem
 * saber o que fazer.
 */
function respostaPadrao(c: ContextoSimples): Resposta {
  const saudacao = c.primeiraVez ? `Oi! Aqui é o atendimento da ${c.nomeLoja}. 😊\n\n` : ''

  return {
    texto:
      `${saudacao}Para ver o cardápio e fazer seu pedido, é por aqui: ${c.link}\n\n` +
      `Posso te ajudar com:\n` +
      `• *cardápio* — o que tem hoje e os preços\n` +
      `• *entrega* — bairros e taxas\n` +
      `• *horário* — quando a gente abre\n` +
      `• *meu pedido* — em que pé está\n` +
      `• *atendente* — falar com uma pessoa`,
    chamadas: [],
  }
}

export function modeloSimples(contexto: ContextoSimples): Modelo {
  return {
    nome: 'sem-ia',
    async responder({ turnos }) {
      const ultima = ultimaFalaDoCliente(turnos)

      // Já respondeu alguma ferramenta nesta rodada? Então é a vez de falar o
      // resultado — e, sem IA, quem fala é a própria ferramenta.
      const resultado = turnos.at(-1)
      if (resultado?.papel === 'ferramenta') {
        return { texto: textoDeFerramenta(resultado, contexto), chamadas: [] }
      }

      const texto = semAcento(ultima)
      const assunto = ASSUNTOS.find((a) => a.gatilhos.some((g) => texto.includes(g)))

      return assunto ? assunto.responder(contexto) : respostaPadrao(contexto)
    },
  }
}

function ultimaFalaDoCliente(turnos: Turno[]) {
  for (let i = turnos.length - 1; i >= 0; i--) {
    const t = turnos[i]
    if (t.papel === 'cliente') return t.texto
  }
  return ''
}

/**
 * Sem IA, o resultado da ferramenta vai quase cru para o cliente — mas nunca
 * o texto que foi escrito para o modelo ler, que tem instrução interna dentro.
 */
function textoDeFerramenta(
  turno: Extract<Turno, { papel: 'ferramenta' }>,
  contexto: ContextoSimples
) {
  if (turno.nome === 'chamar_atendente') {
    return '' // a mensagem de "já chamei alguém" já foi dita antes de chamar
  }

  if (turno.nome === 'status_do_pedido') {
    // A ferramenta devolve instrução para o modelo quando não acha nada;
    // aqui isso vira uma frase de gente.
    if (turno.resultado.startsWith('Este telefone não tem pedido')) {
      return (
        `Não achei pedido neste número. Se você pediu com outro telefone, me diga qual — ` +
        `ou responda *atendente* que eu chamo alguém.\n\nPara fazer um novo: ${contexto.link}`
      )
    }
    return turno.resultado
  }

  return ''
}
