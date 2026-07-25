import { criarClienteAdmin } from './supabase/server'
import { doFusoParaInstante, FUSO, partesNoFuso } from './tempo'

/** Tudo o que a função relatorio_vendas devolve. */
export type Relatorio = {
  resumo: {
    faturamento: number
    pedidos: number
    ticket_medio: number
    descontos: number
    taxas_entrega: number
    itens: number
    clientes: number
    cancelados: number
    nao_pagos: number
  }
  por_dia: { dia: string; rotulo: string; pedidos: number; total: number }[]
  por_hora: { hora: number; pedidos: number; total: number }[]
  por_dia_semana: { dia_semana: number; pedidos: number; total: number }[]
  produtos: { nome: string; quantidade: number; total: number }[]
  categorias: { nome: string; quantidade: number; total: number }[]
  por_tipo: { tipo: string; pedidos: number; total: number; ticket: number }[]
  por_pagamento: { forma: string; metodo: string; pedidos: number; total: number }[]
  cupons: { codigo: string; usos: number; desconto: number; vendeu: number }[]
  bairros: { bairro: string; pedidos: number; total: number; taxas: number }[]
  mesas: { mesa: string; pedidos: number; total: number }[]
  clientes: { novos: number; recorrentes: number }
}

/**
 * Lista, e não objeto: chave que parece número ('7', '30') é reordenada
 * pelo JavaScript e os botões saíam fora da ordem natural na tela.
 */
export const PERIODOS = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'ontem', rotulo: 'Ontem' },
  { chave: '7', rotulo: 'Últimos 7 dias' },
  { chave: '30', rotulo: 'Últimos 30 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: '365', rotulo: 'Último ano' },
] as const

export type Periodo = (typeof PERIODOS)[number]['chave']

export function ehPeriodo(valor: string | undefined): valor is Periodo {
  return PERIODOS.some((p) => p.chave === valor)
}

export function rotuloDoPeriodo(periodo: Periodo) {
  return PERIODOS.find((p) => p.chave === periodo)?.rotulo ?? periodo
}

/**
 * Converte o período escolhido em duas datas reais, no fuso da loja.
 * O fim é sempre exclusivo (< fim), para não contar o mesmo pedido duas vezes
 * quando o dono compara dois períodos seguidos.
 */
export function intervaloDoPeriodo(periodo: Periodo, agora = new Date()) {
  const p = partesNoFuso(agora)
  const meiaNoiteHoje = doFusoParaInstante(p.ano, p.mes, p.dia, 0, 0)
  const umDia = 86400000

  switch (periodo) {
    case 'hoje':
      return { inicio: meiaNoiteHoje, fim: new Date(meiaNoiteHoje.getTime() + umDia) }
    case 'ontem':
      return {
        inicio: new Date(meiaNoiteHoje.getTime() - umDia),
        fim: meiaNoiteHoje,
      }
    case 'mes':
      return {
        inicio: doFusoParaInstante(p.ano, p.mes, 1, 0, 0),
        fim: new Date(meiaNoiteHoje.getTime() + umDia),
      }
    case 'mes_passado': {
      const mesAnterior = p.mes === 1 ? 12 : p.mes - 1
      const ano = p.mes === 1 ? p.ano - 1 : p.ano
      return {
        inicio: doFusoParaInstante(ano, mesAnterior, 1, 0, 0),
        fim: doFusoParaInstante(p.ano, p.mes, 1, 0, 0),
      }
    }
    default: {
      const dias = Number(periodo)
      return {
        inicio: new Date(meiaNoiteHoje.getTime() - (dias - 1) * umDia),
        fim: new Date(meiaNoiteHoje.getTime() + umDia),
      }
    }
  }
}

export async function buscarRelatorio(periodo: Periodo): Promise<Relatorio> {
  const { inicio, fim } = intervaloDoPeriodo(periodo)
  const supabase = criarClienteAdmin()

  const { data, error } = await supabase.rpc('relatorio_vendas', {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_fuso: FUSO,
  })

  if (error) throw new Error(`Não consegui montar o relatório: ${error.message}`)
  return data as Relatorio
}

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]

export const ROTULO_TIPO: Record<string, string> = {
  local: 'No salão',
  retirada: 'Retirada',
  entrega: 'Entrega',
}

export const ROTULO_FORMA: Record<string, string> = {
  online: 'Online (Pix/cartão)',
  local: 'No balcão',
}
