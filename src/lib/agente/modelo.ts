import type { Ferramenta } from './ferramentas'

/**
 * A ponte com o modelo de linguagem.
 *
 * Fica atrás de uma interface por dois motivos: dá para trocar de provedor
 * sem mexer no atendimento, e o teste roda um modelo de mentira com roteiro
 * fixo — atendimento de restaurante não pode depender de sorteio para ser
 * testado.
 *
 * ANTHROPIC_BASE_URL / OPENAI_BASE_URL apontam para outro endereço quando é
 * preciso passar por um gateway da empresa — e é o que o teste usa para pôr
 * um modelo de mentira no lugar do de verdade.
 */

export type Chamada = { nome: string; argumentos: Record<string, unknown> }

export type Resposta = {
  /** Texto para o cliente. Pode vir vazio quando o modelo só chamou ferramenta. */
  texto: string
  chamadas: Chamada[]
}

export type Turno =
  | { papel: 'cliente'; texto: string }
  | { papel: 'agente'; texto: string }
  | { papel: 'ferramenta'; nome: string; resultado: string }

export type Modelo = {
  nome: string
  responder(entrada: {
    sistema: string
    turnos: Turno[]
    ferramentas: Ferramenta[]
  }): Promise<Resposta>
}

const TEMPO_LIMITE_MS = 25000

/**
 * Tem chave de IA? A IA é OPCIONAL: sem ela o chatbot funciona com regras
 * fixas (modelo-simples.ts). A chave só melhora a conversa.
 */
export function temIA() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
}

/** Qual provedor de IA, conforme a chave que existir. Null = sem IA. */
export function modeloDeIA(): Modelo | null {
  if (process.env.ANTHROPIC_API_KEY) return modeloClaude()
  if (process.env.OPENAI_API_KEY) return modeloOpenAI()
  return null
}

// ------------------------------------------------------------------ Claude

function modeloClaude(): Modelo {
  const id = process.env.AGENTE_MODELO || 'claude-sonnet-5'

  return {
    nome: `anthropic:${id}`,
    async responder({ sistema, turnos, ferramentas }) {
      const mensagens = turnosParaClaude(turnos)

      const base = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, '') ?? 'https://api.anthropic.com'
      const resposta = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: id,
          max_tokens: 1024,
          system: sistema,
          messages: mensagens,
          tools: ferramentas.map((f) => ({
            name: f.nome,
            description: f.descricao,
            input_schema: f.parametros,
          })),
        }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      })

      if (!resposta.ok) {
        throw new Error(`anthropic ${resposta.status}: ${await resposta.text()}`)
      }

      const corpo = (await resposta.json()) as {
        content: { type: string; text?: string; name?: string; input?: unknown }[]
      }

      return {
        texto: corpo.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text ?? '')
          .join('\n')
          .trim(),
        chamadas: corpo.content
          .filter((p) => p.type === 'tool_use')
          .map((p) => ({
            nome: p.name!,
            argumentos: (p.input as Record<string, unknown>) ?? {},
          })),
      }
    },
  }
}

/**
 * O histórico vira texto puro, inclusive o resultado das ferramentas.
 *
 * O jeito "certo" seria devolver os blocos tool_use/tool_result com os ids
 * originais, mas isso obrigaria a guardar o formato de um provedor dentro do
 * banco. Como o estado de verdade (carrinho, endereço) mora em coluna e é
 * reinjetado no prompt a cada rodada, o modelo não precisa reconstruir nada a
 * partir da transcrição — ela serve só para ele lembrar do que foi conversado.
 */
function turnosParaClaude(turnos: Turno[]) {
  const mensagens: { role: 'user' | 'assistant'; content: string }[] = []

  for (const turno of turnos) {
    if (turno.papel === 'cliente') {
      mensagens.push({ role: 'user', content: turno.texto })
    } else if (turno.papel === 'agente') {
      if (turno.texto.trim()) mensagens.push({ role: 'assistant', content: turno.texto })
    } else {
      mensagens.push({
        role: 'user',
        content: `[sistema] resultado de ${turno.nome}: ${turno.resultado}`,
      })
    }
  }

  // A API exige começar com o cliente e alternar; junta o que ficou colado.
  const juntas: typeof mensagens = []
  for (const m of mensagens) {
    const ultima = juntas.at(-1)
    if (ultima?.role === m.role) ultima.content += `\n\n${m.content}`
    else juntas.push(m)
  }
  while (juntas.length && juntas[0].role !== 'user') juntas.shift()

  return juntas
}

// ------------------------------------------------------------------ OpenAI

function modeloOpenAI(): Modelo {
  const id = process.env.AGENTE_MODELO || 'gpt-4.1-mini'

  return {
    nome: `openai:${id}`,
    async responder({ sistema, turnos, ferramentas }) {
      const mensagens: { role: string; content: string }[] = [{ role: 'system', content: sistema }]

      for (const turno of turnos) {
        if (turno.papel === 'cliente') mensagens.push({ role: 'user', content: turno.texto })
        else if (turno.papel === 'agente') {
          if (turno.texto.trim()) mensagens.push({ role: 'assistant', content: turno.texto })
        } else {
          mensagens.push({
            role: 'user',
            content: `[sistema] resultado de ${turno.nome}: ${turno.resultado}`,
          })
        }
      }

      const base = process.env.OPENAI_BASE_URL?.replace(/\/$/, '') ?? 'https://api.openai.com'
      const resposta = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: id,
          messages: mensagens,
          tools: ferramentas.map((f) => ({
            type: 'function',
            function: { name: f.nome, description: f.descricao, parameters: f.parametros },
          })),
        }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      })

      if (!resposta.ok) {
        throw new Error(`openai ${resposta.status}: ${await resposta.text()}`)
      }

      const corpo = (await resposta.json()) as {
        choices: {
          message: {
            content: string | null
            tool_calls?: { function: { name: string; arguments: string } }[]
          }
        }[]
      }

      const mensagem = corpo.choices[0]?.message

      return {
        texto: (mensagem?.content ?? '').trim(),
        chamadas: (mensagem?.tool_calls ?? []).map((c) => ({
          nome: c.function.name,
          argumentos: analisarJson(c.function.arguments),
        })),
      }
    },
  }
}

function analisarJson(bruto: string): Record<string, unknown> {
  try {
    return JSON.parse(bruto) as Record<string, unknown>
  } catch {
    return {}
  }
}
