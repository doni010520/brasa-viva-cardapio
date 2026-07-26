/**
 * Testa o agente que atende pelo WhatsApp, de ponta a ponta.
 *
 * O modelo de verdade é substituído por um DE MENTIRA, com roteiro fixo, por
 * dois motivos: o teste não pode depender de chave de API nem de o modelo
 * estar de bom humor, e o que precisa ser garantido aqui não é a lábia do
 * robô — é que o pedido chegue certo na cozinha e que ele não consiga
 * inventar preço, prato ou forma de pagamento proibida.
 *
 * Sobe um servidor de modelo falso e uma instância do app apontada para ele.
 * O MESMO roteiro roda nos dois provedores — o cliente do restaurante não
 * pode receber atendimento diferente por causa de qual chave o dono usou.
 *
 * Uso:  npm run build && node scripts/teste-agente.mjs [anthropic|openai]
 */
import { createServer } from 'node:http'
import { spawn, execSync } from 'node:child_process'
import { connect } from 'node:net'
import { env } from './credenciais.mjs'

const PROVEDOR = process.argv[2] === 'openai' ? 'openai' : 'anthropic'
const PORTA_MODELO = 4999
const PORTA_APP = 3131
const APP = `http://localhost:${PORTA_APP}`
const TOKEN = 'token-de-teste-do-webhook'
const TELEFONE = '71977776666'

let passos = 0
let falhas = 0
const ok = (m) => (passos++, console.log(`  [ok] ${m}`))
const falha = (m) => (falhas++, console.log(`  [FALHA] ${m}`))
const conferir = (c, m) => (c ? ok(m) : falha(m))

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.PROJECT_ID}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

// ------------------------------------------------------- modelo de mentira
/**
 * Devolve, em ordem, o que foi posto na fila, no formato do provedor da vez.
 * O prompt recebido fica guardado para o teste poder conferir o que o agente
 * contou ao modelo.
 */
const fila = []
const prompts = []

/** O prompt de sistema vem em campo próprio na Anthropic e como primeira
 *  mensagem na OpenAI. O teste olha para os dois pelo mesmo nome. */
function sistemaDoCorpo(corpo) {
  if (corpo.system) return corpo.system
  const primeira = corpo.messages?.[0]
  return primeira?.role === 'system' ? primeira.content : ''
}

const servidorModelo = createServer((req, res) => {
  let corpo = ''
  req.on('data', (p) => (corpo += p))
  req.on('end', () => {
    const recebido = JSON.parse(corpo || '{}')
    prompts.push({ ...recebido, system: sistemaDoCorpo(recebido) })
    const proximo = fila.shift() ?? { texto: 'Certo!' }

    let resposta
    if (PROVEDOR === 'openai') {
      resposta = {
        choices: [
          {
            message: {
              content: proximo.texto ?? null,
              tool_calls: proximo.ferramenta
                ? [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: proximo.ferramenta,
                        arguments: JSON.stringify(proximo.argumentos ?? {}),
                      },
                    },
                  ]
                : undefined,
            },
          },
        ],
      }
    } else {
      const content = []
      if (proximo.texto) content.push({ type: 'text', text: proximo.texto })
      if (proximo.ferramenta) {
        content.push({
          type: 'tool_use',
          id: `tool_${content.length}`,
          name: proximo.ferramenta,
          input: proximo.argumentos ?? {},
        })
      }
      resposta = { content }
    }

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(resposta))
  })
})

// ---------------------------------------------------------------- utilidades
async function mandarMensagem(texto, extras = {}) {
  return fetch(`${APP}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': TOKEN },
    body: JSON.stringify({
      message: {
        id: `msg-${Math.round(performance.now() * 1000)}`,
        chatid: `55${TELEFONE}@s.whatsapp.net`,
        fromMe: false,
        text: texto,
        ...extras,
      },
    }),
  })
}

/**
 * Porta ocupada é armadilha: o teste passaria a conversar com um servidor
 * antigo, de outra rodada, e daria resultado sem valer nada. Melhor parar.
 */
function portaLivre(porta) {
  return new Promise((resolve) => {
    const soquete = connect({ port: porta, host: '127.0.0.1' })
    soquete.on('connect', () => (soquete.destroy(), resolve(false)))
    soquete.on('error', () => resolve(true))
    setTimeout(() => (soquete.destroy(), resolve(true)), 1500)
  })
}

/**
 * No Windows, spawn com shell cria cmd.exe no meio: matar o filho deixa o
 * `next start` vivo segurando a porta. Aqui derruba a árvore toda.
 */
function derrubar(processo) {
  if (!processo?.pid) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${processo.pid}`, { stdio: 'ignore' })
    } else {
      process.kill(-processo.pid)
    }
  } catch {
    processo.kill()
  }
}

async function esperarApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${APP}/api/saude`)
      if (r.ok) return true
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// ------------------------------------------------------------------ execução
await sql(`delete from public.conversas_whatsapp where telefone = '${TELEFONE}';`)
await sql(`delete from public.pedidos where cliente_telefone like '%${TELEFONE}%';`)
await sql('update public.configuracoes set agente_whatsapp_ativo = true where id = 1;')

// ids reais do cardápio: o agente só pode usar o que existe
const produtos = await sql(`
  select p.id, p.nome, coalesce(p.preco_promo_centavos, p.preco_centavos) as preco
  from public.produtos p
  where p.disponivel and p.modo_consumo in ('ambos','so_viagem')
    and not exists (select 1 from public.grupos_opcoes g where g.produto_id = p.id and g.min_escolhas > 0)
  order by preco limit 1;`)
const produto = produtos[0]
const bairros = await sql('select id, nome, taxa_centavos from public.bairros_entrega where ativo limit 1;')
const bairro = bairros[0]

console.log(`\nProduto de teste: ${produto.nome} (${(produto.preco / 100).toFixed(2)})`)

for (const porta of [PORTA_MODELO, PORTA_APP]) {
  if (!(await portaLivre(porta))) {
    console.error(
      `
A porta ${porta} já está ocupada — provavelmente sobrou servidor de uma rodada ` +
        `anterior. Feche-o antes, senão o teste conversa com o servidor errado.`
    )
    process.exit(1)
  }
}

await new Promise((r) => servidorModelo.listen(PORTA_MODELO, r))

const app = spawn('npx', ['next', 'start', '-p', String(PORTA_APP)], {
  cwd: 'C:/Users/adoni/cardapio-online',
  shell: true,
  env: {
    ...process.env,
    // uma chave só: modeloPadrao() escolhe o provedor pela que existir
    ANTHROPIC_API_KEY: PROVEDOR === 'anthropic' ? 'chave-de-mentira' : '',
    ANTHROPIC_BASE_URL: `http://localhost:${PORTA_MODELO}`,
    OPENAI_API_KEY: PROVEDOR === 'openai' ? 'chave-de-mentira' : '',
    OPENAI_BASE_URL: `http://localhost:${PORTA_MODELO}`,
    AGENTE_MODELO: 'modelo-de-mentira',
    WHATSAPP_WEBHOOK_TOKEN: TOKEN,
    // uazapi fica de fora: o teste não manda mensagem para ninguém de verdade
    UAZAPI_URL: '',
    UAZAPI_TOKEN: '',
  },
  stdio: 'ignore',
})

try {
  conferir(await esperarApp(), 'app de teste no ar')

  // --------------------------------------------- 1. a porta está fechada?
  console.log('\n1) O webhook é público — e desconfia de tudo')
  const semToken = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { text: 'oi' } }),
  })
  conferir(semToken.status === 401, `sem token devolve 401 (deu ${semToken.status})`)

  const tokenErrado = await fetch(`${APP}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': 'chute' },
    body: JSON.stringify({ message: { text: 'oi' } }),
  })
  conferir(tokenErrado.status === 401, 'token errado devolve 401')

  fila.length = 0
  const daLoja = await mandarMensagem('mensagem nossa', { fromMe: true })
  conferir(
    (await daLoja.json()).ignorado?.includes('própria loja'),
    'mensagem enviada pela própria loja é ignorada (senão o robô conversa sozinho)'
  )

  const grupo = await mandarMensagem('bom dia pessoal', {
    chatid: '5571999999999-1234@g.us',
  })
  conferir((await grupo.json()).ignorado === 'grupo', 'mensagem de grupo é ignorada')

  // --------------------------------------------- 2. conversa que vira pedido
  console.log('\n2) Conversa que termina em pedido na cozinha')

  fila.push({ texto: 'Opa! Tudo bom? Temos marmita fresquinha hoje. O que vai ser?' })
  const r1 = await mandarMensagem('boa tarde, o que tem hoje?')
  conferir((await r1.json()).ok === true, 'robô respondeu a primeira mensagem')

  // o modelo pede a ferramenta; depois de executada, ele fala com o cliente
  fila.push({ ferramenta: 'adicionar_item', argumentos: { produto_id: produto.id, quantidade: 2 } })
  fila.push({ texto: 'Anotei 2! Mais alguma coisa?' })
  await mandarMensagem(`quero 2 ${produto.nome}`)

  const comCarrinho = await sql(
    `select carrinho, nome from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  conferir(comCarrinho[0]?.carrinho?.length === 1, 'item entrou no carrinho da conversa')
  conferir(comCarrinho[0]?.carrinho?.[0]?.quantidade === 2, 'quantidade guardada certa')

  // --------------------------------------------- 3. o que ele NÃO consegue
  console.log('\n3) O que o robô NÃO consegue fazer')

  fila.push({
    ferramenta: 'adicionar_item',
    argumentos: { produto_id: '00000000-0000-0000-0000-000000000000', quantidade: 1 },
  })
  fila.push({ texto: 'Esse a gente não tem, viu?' })
  await mandarMensagem('quero um prato de lagosta ao thermidor')

  const depoisDaInvencao = await sql(
    `select carrinho from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  conferir(
    depoisDaInvencao[0]?.carrinho?.length === 1,
    'prato inventado NÃO entra no carrinho'
  )

  // entrega paga em dinheiro é proibida pela casa — nem o robô fura
  fila.push({
    ferramenta: 'definir_entrega',
    argumentos: {
      tipo: 'entrega',
      bairro_id: bairro.id,
      rua: 'Rua de Teste',
      numero: '10',
    },
  })
  fila.push({ ferramenta: 'definir_nome', argumentos: { nome: 'Cliente do Robo' } })
  fila.push({ ferramenta: 'fechar_pedido', argumentos: { forma_pagamento: 'local' } })
  fila.push({ texto: 'Para entrega só dá pelo site, viu?' })
  await mandarMensagem(`manda entregar no ${bairro.nome}, pago em dinheiro`)

  const semPedido = await sql(
    `select count(*)::int as n from public.pedidos where cliente_telefone like '%${TELEFONE}%';`
  )
  conferir(
    semPedido[0]?.n === 0,
    'entrega paga em dinheiro é recusada, mesmo o robô mandando fechar'
  )

  // --------------------------------------------- 4. fecha de verdade
  console.log('\n4) Retirada no balcão: fecha de verdade')

  fila.push({ ferramenta: 'definir_entrega', argumentos: { tipo: 'retirada' } })
  fila.push({ ferramenta: 'fechar_pedido', argumentos: { forma_pagamento: 'local' } })
  fila.push({ texto: 'Fechado! Pode vir buscar.' })
  await mandarMensagem('então deixa, eu passo aí para buscar')

  const pedidos = await sql(`
    select p.id, p.numero, p.status, p.total_centavos, p.tipo_entrega, p.forma_pagamento,
           p.cliente_nome, p.cliente_telefone
    from public.pedidos p
    where p.cliente_telefone like '%${TELEFONE}%';`)

  conferir(pedidos.length === 1, `pedido criado no banco (${pedidos.length})`)
  const pedido = pedidos[0]

  if (pedido) {
    conferir(pedido.status === 'recebido', 'pedido entrou direto na fila da cozinha')
    conferir(pedido.tipo_entrega === 'retirada', 'gravado como retirada')
    conferir(pedido.cliente_nome === 'Cliente do Robo', 'nome do cliente foi para o pedido')
    conferir(
      pedido.total_centavos === produto.preco * 2,
      `total conferido pelo SERVIDOR: ${(pedido.total_centavos / 100).toFixed(2)} ` +
        `(2 x ${(produto.preco / 100).toFixed(2)})`
    )

    const itens = await sql(
      `select quantidade, preco_unit_centavos from public.pedido_itens where pedido_id = '${pedido.id}';`
    )
    conferir(
      itens[0]?.preco_unit_centavos === produto.preco,
      'preço unitário saiu do banco, não do modelo'
    )

    // o resto do sistema não sabe (nem precisa saber) que veio de robô
    const fila_impressao = await sql(
      `select count(*)::int as n from public.impressoes where pedido_id = '${pedido.id}';`
    )
    conferir(fila_impressao[0]?.n >= 1, 'comanda entrou na fila de impressão igual a qualquer pedido')

    const cliente = await sql(`
      select c.nome, c.total_pedidos from public.clientes c
      join public.pedidos p on p.cliente_id = c.id where p.id = '${pedido.id}';`)
    conferir(cliente[0]?.nome === 'Cliente do Robo', 'cliente entrou no CRM do dono')
  }

  const depoisDeFechar = await sql(
    `select carrinho, ultimo_pedido_id from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  conferir(
    depoisDeFechar[0]?.carrinho?.length === 0,
    'carrinho zerado após fechar (senão "quero mais um" viraria pedido dobrado)'
  )

  // --------------------------------------------- 5. mensagem repetida
  console.log('\n5) Webhook repetindo não vira pedido dobrado')
  const idRepetido = 'mensagem-repetida-123'
  fila.push({ texto: 'Oi!' })
  await mandarMensagem('oi de novo', { id: idRepetido })
  const repetida = await mandarMensagem('oi de novo', { id: idRepetido })
  conferir(
    (await repetida.json()).ignorado === 'mensagem repetida',
    'segunda entrega da MESMA mensagem é descartada'
  )

  // --------------------------------------------- 6. humano assume
  console.log('\n6) Quando um humano assume, o robô cala a boca')
  await sql(
    `update public.conversas_whatsapp set humano_assumiu = true where telefone = '${TELEFONE}';`
  )
  const antesDoPrompt = prompts.length
  fila.push({ texto: 'nao deveria falar' })
  await mandarMensagem('preciso de ajuda com um problema')
  conferir(
    prompts.length === antesDoPrompt,
    'com humano na conversa, o modelo nem é chamado'
  )

  const guardou = await sql(
    `select mensagens from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  const ultima = guardou[0]?.mensagens?.at(-1)
  conferir(
    ultima?.papel === 'cliente' && ultima?.texto === 'preciso de ajuda com um problema',
    'a mensagem do cliente continua sendo guardada para a equipe ler'
  )

  // --------------------------------------------- 7. o que o robô enxerga
  console.log('\n7) O que o agente conta ao modelo')
  const prompt = prompts.at(-1)?.system ?? ''
  conferir(prompt.includes(produto.nome), 'o cardápio real vai no prompt')
  conferir(
    prompt.includes('Entrega é SEMPRE paga pelo site'),
    'a regra de pagamento da casa vai no prompt'
  )
  conferir(
    prompt.includes(bairro.nome),
    'os bairros de entrega vão no prompt (para não inventar área)'
  )
  conferir(
    !prompt.includes('Buffet livre'),
    'buffet livre NÃO é oferecido pelo WhatsApp (é coisa de quem está no salão)'
  )
} catch (erro) {
  falha(`quebrou no meio: ${erro.message}`)
} finally {
  derrubar(app)
  servidorModelo.close()
  await sql('update public.configuracoes set agente_whatsapp_ativo = false where id = 1;')
}

console.log(`\n${'='.repeat(52)}`)
console.log(`  ${passos} verificações ok, ${falhas} falha(s)`)
console.log('='.repeat(52))
process.exit(falhas ? 1 : 0)
