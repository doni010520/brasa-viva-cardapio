import type { NextRequest } from 'next/server'
import { usuarioAdminAtual } from '@/lib/supabase/server'
import {
  buscarRelatorio,
  DIAS_SEMANA,
  ehPeriodo,
  ROTULO_FORMA,
  ROTULO_TIPO,
  rotuloDoPeriodo,
  type Periodo,
} from '@/lib/relatorios'

/**
 * Exporta o relatório em planilha, para o dono abrir no Excel e mandar ao
 * contador. Vai com BOM e separador ponto-e-vírgula porque é assim que o
 * Excel em português abre sem embaralhar acento e coluna.
 */
export async function GET(request: NextRequest) {
  if (!(await usuarioAdminAtual())) {
    return new Response('Acesso negado', { status: 403 })
  }

  const bruto = new URL(request.url).searchParams.get('periodo') ?? '30'
  const periodo: Periodo = ehPeriodo(bruto) ? bruto : '30'
  const r = await buscarRelatorio(periodo)

  const real = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',')
  const linhas: string[][] = []

  const secao = (titulo: string, colunas: string[]) => {
    if (linhas.length) linhas.push([])
    linhas.push([titulo.toUpperCase()])
    linhas.push(colunas)
  }

  secao(`Resumo — ${rotuloDoPeriodo(periodo)}`, ['Indicador', 'Valor'])
  linhas.push(['Faturamento', real(r.resumo.faturamento)])
  linhas.push(['Pedidos', String(r.resumo.pedidos)])
  linhas.push(['Ticket médio', real(r.resumo.ticket_medio)])
  linhas.push(['Itens vendidos', String(r.resumo.itens)])
  linhas.push(['Clientes', String(r.resumo.clientes)])
  linhas.push(['Clientes novos', String(r.clientes.novos)])
  linhas.push(['Clientes que voltaram', String(r.clientes.recorrentes)])
  linhas.push(['Descontos dados', real(r.resumo.descontos)])
  linhas.push(['Taxas de entrega', real(r.resumo.taxas_entrega)])
  linhas.push(['Pedidos cancelados', String(r.resumo.cancelados)])
  linhas.push(['Pedidos não pagos', String(r.resumo.nao_pagos)])

  secao('Vendas por dia', ['Dia', 'Pedidos', 'Faturamento'])
  for (const d of r.por_dia) linhas.push([d.rotulo, String(d.pedidos), real(d.total)])

  secao('Movimento por hora', ['Hora', 'Pedidos', 'Faturamento'])
  for (const h of r.por_hora) {
    linhas.push([`${String(h.hora).padStart(2, '0')}:00`, String(h.pedidos), real(h.total)])
  }

  secao('Por dia da semana', ['Dia', 'Pedidos', 'Faturamento'])
  for (const d of r.por_dia_semana) {
    linhas.push([DIAS_SEMANA[d.dia_semana], String(d.pedidos), real(d.total)])
  }

  secao('Produtos', ['Produto', 'Quantidade', 'Faturamento'])
  for (const p of r.produtos) linhas.push([p.nome, String(p.quantidade), real(p.total)])

  secao('Categorias', ['Categoria', 'Quantidade', 'Faturamento'])
  for (const c of r.categorias) linhas.push([c.nome, String(c.quantidade), real(c.total)])

  secao('Salão, retirada ou entrega', ['Onde', 'Pedidos', 'Ticket médio', 'Faturamento'])
  for (const t of r.por_tipo) {
    linhas.push([ROTULO_TIPO[t.tipo] ?? t.tipo, String(t.pedidos), real(t.ticket), real(t.total)])
  }

  secao('Formas de pagamento', ['Forma', 'Método', 'Pedidos', 'Faturamento'])
  for (const p of r.por_pagamento) {
    linhas.push([ROTULO_FORMA[p.forma] ?? p.forma, p.metodo, String(p.pedidos), real(p.total)])
  }

  if (r.cupons.length) {
    secao('Cupons', ['Cupom', 'Usos', 'Desconto dado', 'Faturamento gerado'])
    for (const c of r.cupons) {
      linhas.push([c.codigo, String(c.usos), real(c.desconto), real(c.vendeu)])
    }
  }

  if (r.bairros.length) {
    secao('Entregas por bairro', ['Bairro', 'Pedidos', 'Taxas', 'Faturamento'])
    for (const b of r.bairros) {
      linhas.push([b.bairro, String(b.pedidos), real(b.taxas), real(b.total)])
    }
  }

  if (r.mesas.length) {
    secao('Consumo por mesa', ['Mesa', 'Pedidos', 'Faturamento'])
    for (const m of r.mesas) linhas.push([`Mesa ${m.mesa}`, String(m.pedidos), real(m.total)])
  }

  const escapar = (campo: string) =>
    /[";\n]/.test(campo) ? `"${campo.replace(/"/g, '""')}"` : campo

  // ﻿ é o BOM: sem ele o Excel abre "Porções" como "PorÃ§Ãµes"
  const csv = '﻿' + linhas.map((l) => l.map(escapar).join(';')).join('\r\n')

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio-brasaviva-${periodo}-${hoje}.csv"`,
    },
  })
}
