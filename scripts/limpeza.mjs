/**
 * Limpeza dos testes — e a trava para eles não apagarem o que não é deles.
 *
 * Isto existe porque já aconteceu o pior: um teste rodou `delete from
 * pedidos` no mesmo banco que estava sendo usado para demonstração e levou
 * junto um pedido de verdade. Teste não pode apagar dado de ninguém.
 *
 * Regra desta casa:
 *   - o normal é apagar SÓ o que o próprio teste criou, pelo telefone/nome;
 *   - teste que precisa da tabela vazia para valer (relatórios, faturamento)
 *     é destrutivo por natureza e só roda com PERMITIR_LIMPAR_TUDO=1.
 */

/** Telefones reservados para teste. Nenhum cliente de verdade usa estes. */
export const TELEFONES_DE_TESTE = [
  '71988887777', // teste-fluxo
  '71988886666', // teste-meus-pedidos
  '71988776655', // teste-mesa-crm
  '71977776666', // teste-agente
  '71966665555', // teste-chatbot-sem-ia
  '71999999999', // teste-seguranca (invasor)
  '71999998888', // demonstração
  '71999990000', // comanda de exemplo
  '00000000000', // conversa de teste do painel
]

/** Nomes que só aparecem em pedido criado por teste. */
export const NOMES_DE_TESTE = [
  'Cliente de Teste',
  'Cliente Historico',
  'Cliente CRM',
  'Cliente do Robo',
  'Cliente do Site',
  'Cliente Sem IA',
  'Cliente Demonstracao',
  'Invasor',
  'Adoni Teste',
]

function lista(valores) {
  return valores.map((v) => `'${v}'`).join(',')
}

/**
 * Apaga só o rastro dos testes. Um pedido feito por gente de verdade, no
 * meio da rodada, continua de pé.
 */
export async function limparDadosDeTeste(sql, extras = {}) {
  const telefones = [...TELEFONES_DE_TESTE, ...(extras.telefones ?? [])]
  const nomes = [...NOMES_DE_TESTE, ...(extras.nomes ?? [])]

  // regexp_replace tira máscara: o pedido guarda "(71) 98888-7777"
  const porTelefone = `regexp_replace(cliente_telefone, '[^0-9]', '', 'g') in (${lista(telefones)})`
  const porNome = `cliente_nome in (${lista(nomes)})`

  await sql(`delete from public.pedidos where ${porTelefone} or ${porNome};`)
  await sql(`delete from public.clientes where telefone in (${lista(telefones)});`)
  await sql(`delete from public.conversas_whatsapp where telefone in (${lista(telefones)});`)

  // Códigos e sessões do login. Sem isto, rodar o teste três vezes seguidas
  // estoura o limite de 5 códigos por hora e ele falha por um motivo que não
  // é defeito nenhum — é a proteção funcionando.
  await sql(`delete from public.codigos_acesso where telefone in (${lista(telefones)});`)
  await sql(`delete from public.sessoes_cliente where telefone in (${lista(telefones)});`)
  // comanda órfã ficaria na fila do agente de impressão para sempre
  await sql('delete from public.impressoes where pedido_id not in (select id from public.pedidos);')
}

/**
 * Porteiro dos testes destrutivos.
 *
 * Alguns testes (relatórios, faturamento) só valem com a tabela vazia: eles
 * conferem somas do dia, e um pedido de verdade no meio estraga a conta. Em
 * vez de apagar tudo escondido, eles param e explicam.
 */
export async function limparTudoComPermissao(sql, nomeDoTeste) {
  if (process.env.PERMITIR_LIMPAR_TUDO !== '1') {
    console.error(
      `\n${'='.repeat(60)}\n` +
        `  ${nomeDoTeste} precisa da tabela de pedidos VAZIA para conferir\n` +
        `  as somas do dia — ou seja, ele APAGA TODOS OS PEDIDOS.\n\n` +
        `  Se este banco tem pedido de verdade (demonstração para o cliente,\n` +
        `  loja no ar), NÃO rode este teste.\n\n` +
        `  Para rodar mesmo assim:\n` +
        `    PERMITIR_LIMPAR_TUDO=1 node scripts/${nomeDoTeste}.mjs\n` +
        `${'='.repeat(60)}\n`
    )
    process.exit(1)
  }

  const antes = await sql('select count(*)::int as n from public.pedidos;')
  const quantos = antes?.[0]?.n ?? 0
  if (quantos > 0) {
    console.log(`  [aviso] apagando ${quantos} pedido(s) — PERMITIR_LIMPAR_TUDO está ligado`)
  }

  await sql('delete from public.pedidos;')
}
