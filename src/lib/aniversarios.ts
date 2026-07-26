import { buscarConfiguracoes } from './dados'
import { criarClienteAdmin } from './supabase/server'
import { partesNoFuso } from './tempo'
import { enviarTexto, whatsappConfigurado } from './whatsapp'

/**
 * Parabéns de aniversário pelo WhatsApp.
 *
 * A data de nascimento é opcional no checkout de propósito — ela nunca trava
 * uma venda. Quem preencheu, recebe.
 *
 * Duas travas contra o pior erro possível aqui, que é mandar mensagem
 * repetida para a mesma pessoa: o ano do último parabéns fica gravado, e a
 * marcação acontece ANTES do envio. Se a uazapi cair no meio da fila, alguém
 * fica sem parabéns — melhor que alguém receber três.
 */

export type ResultadoAniversarios = {
  encontrados: number
  enviados: number
  falhas: number
  pulados: number
}

export async function enviarParabensDeHoje(): Promise<ResultadoAniversarios> {
  const config = await buscarConfiguracoes()
  const supabase = criarClienteAdmin()

  // O dia é o do restaurante, não o do servidor: às 21h de Salvador o
  // servidor em UTC já virou o dia, e o parabéns sairia atrasado.
  const hoje = partesNoFuso()
  const anoAtual = hoje.ano

  const { data } = await supabase
    .from('clientes')
    .select('id, nome, telefone, data_nascimento, aniversario_avisado_ano, aceita_promocoes')
    .not('data_nascimento', 'is', null)

  const aniversariantes = (data ?? []).filter((cliente) => {
    const [, mes, dia] = String(cliente.data_nascimento).split('-').map(Number)
    return mes === hoje.mes && dia === hoje.dia
  })

  const resultado: ResultadoAniversarios = {
    encontrados: aniversariantes.length,
    enviados: 0,
    falhas: 0,
    pulados: 0,
  }

  if (!whatsappConfigurado()) {
    resultado.pulados = aniversariantes.length
    return resultado
  }

  const link = process.env.NEXT_PUBLIC_URL_BASE?.replace(/\/$/, '') ?? ''

  for (const cliente of aniversariantes) {
    // já mandou este ano, ou a pessoa não quer receber promoção
    if (cliente.aniversario_avisado_ano === anoAtual || !cliente.aceita_promocoes) {
      resultado.pulados++
      continue
    }

    // Marca ANTES de enviar: se algo estourar no meio, o pior caso é não
    // mandar — nunca mandar duas vezes.
    const { error } = await supabase
      .from('clientes')
      .update({ aniversario_avisado_ano: anoAtual })
      .eq('id', cliente.id)
      .eq('aniversario_avisado_ano', cliente.aniversario_avisado_ano ?? null)

    if (error) {
      resultado.pulados++
      continue
    }

    const enviado = await enviarTexto(
      cliente.telefone,
      montarMensagem({
        modelo: config.mensagem_aniversario,
        nome: primeiroNome(cliente.nome),
        loja: config.nome,
        link,
        cupom: config.cupom_aniversario,
      })
    )

    enviado ? resultado.enviados++ : resultado.falhas++
  }

  return resultado
}

/** Só o primeiro nome: "Feliz aniversário, José Carlos da Silva" soa a cobrança. */
function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome
}

export function montarMensagem({
  modelo,
  nome,
  loja,
  link,
  cupom,
}: {
  modelo: string | null
  nome: string
  loja: string
  link: string
  cupom: string | null
}) {
  const padrao =
    'Feliz aniversário, {nome}! 🎉\n\nA turma da {loja} deseja um dia daqueles. ' +
    'Se quiser comemorar com a gente, é só pedir por aqui: {link}'

  const texto = (modelo?.trim() || padrao)
    .replaceAll('{nome}', nome)
    .replaceAll('{loja}', loja)
    .replaceAll('{link}', link)
    .replaceAll('{cupom}', cupom ?? '')

  // Cupom configurado mas não citado no texto? Emenda no fim, senão o brinde
  // ficaria cadastrado e ninguém saberia dele.
  if (cupom && !texto.includes(cupom)) {
    return `${texto}\n\nUse o cupom *${cupom}* no site. 🎁`
  }
  return texto
}
