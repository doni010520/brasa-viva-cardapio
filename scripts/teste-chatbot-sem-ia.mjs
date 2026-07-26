/**
 * Testa o chatbot SEM IA — o modo que funciona sem chave de API nenhuma.
 *
 * Este é o modo padrão do sistema, e por isso o mais importante de garantir:
 * o dono liga o atendimento no primeiro dia, de graça, e só depois decide se
 * quer pagar por IA. O trabalho é o mesmo dos dois jeitos — responder o
 * básico e mandar o link do site.
 *
 * Uso:  npm run build && node scripts/teste-chatbot-sem-ia.mjs
 */
import { spawn, execSync } from 'node:child_process'
import { connect } from 'node:net'
import { env } from './credenciais.mjs'

const PORTA_APP = 3133
const APP = `http://localhost:${PORTA_APP}`
const TOKEN = 'token-de-teste-sem-ia'
const TELEFONE = '71966665555'
const LINK = env.NEXT_PUBLIC_URL_BASE.replace(/\/$/, '')

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

function portaLivre(porta) {
  return new Promise((resolve) => {
    const soquete = connect({ port: porta, host: '127.0.0.1' })
    soquete.on('connect', () => (soquete.destroy(), resolve(false)))
    soquete.on('error', () => resolve(true))
    setTimeout(() => (soquete.destroy(), resolve(true)), 1500)
  })
}

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

/** Manda a mensagem e devolve o que o robô respondeu, lendo da conversa. */
async function conversar(texto) {
  await fetch(`${APP}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': TOKEN },
    body: JSON.stringify({
      message: {
        id: `msg-${Math.round(performance.now() * 1000)}`,
        chatid: `55${TELEFONE}@s.whatsapp.net`,
        fromMe: false,
        text: texto,
      },
    }),
  })

  const r = await sql(
    `select mensagens from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  const mensagens = r[0]?.mensagens ?? []
  // tudo que o robô falou depois da última fala do cliente
  const ultimoCliente = mensagens.map((m) => m.papel).lastIndexOf('cliente')
  return mensagens
    .slice(ultimoCliente + 1)
    .map((m) => m.texto)
    .join('\n')
}

await sql(`delete from public.conversas_whatsapp where telefone = '${TELEFONE}';`)
await sql(`delete from public.pedidos where cliente_telefone like '%${TELEFONE}%';`)
await sql(`delete from public.clientes where telefone = '${TELEFONE}';`)
await sql('update public.configuracoes set agente_whatsapp_ativo = true where id = 1;')

if (!(await portaLivre(PORTA_APP))) {
  console.error(`\nA porta ${PORTA_APP} está ocupada. Feche o servidor antigo antes.`)
  process.exit(1)
}

const app = spawn('npx', ['next', 'start', '-p', String(PORTA_APP)], {
  cwd: 'C:/Users/adoni/cardapio-online',
  shell: true,
  env: {
    ...process.env,
    // NENHUMA chave de IA: é exatamente esse o cenário que se quer provar
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
    WHATSAPP_WEBHOOK_TOKEN: TOKEN,
    UAZAPI_URL: '',
    UAZAPI_TOKEN: '',
  },
  stdio: 'ignore',
})

try {
  let subiu = false
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${APP}/api/saude`)).ok) {
        subiu = true
        break
      }
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  conferir(subiu, 'app no ar SEM chave de IA nenhuma')

  console.log('\n1) Primeira mensagem')
  const oi = await conversar('oi')
  conferir(oi.includes(LINK), 'a primeira resposta já traz o link do site')
  conferir(/cardápio/i.test(oi), 'oferece os assuntos que sabe responder')
  console.log(`     "${oi.split('\n')[0]}"`)

  console.log('\n2) Assuntos que ele resolve sozinho')

  const cardapio = await conversar('queria ver o cardapio')
  conferir(cardapio.includes(LINK), 'cardápio: manda o link')

  const entrega = await conversar('voces entregam?')
  const bairros = await sql('select nome from public.bairros_entrega where ativo;')
  conferir(
    bairros.some((b) => entrega.includes(b.nome)),
    `entrega: lista os bairros de verdade (${bairros.map((b) => b.nome).join(', ')})`
  )
  conferir(entrega.includes(LINK), 'entrega: também manda o link')

  const horario = await conversar('que horas voces abrem?')
  conferir(/aberto|fechado/i.test(horario), 'horário: responde se está aberto agora')

  console.log('\n3) Pedido feito no site')
  const cliente = await sql(`
    insert into public.clientes (telefone, nome) values ('${TELEFONE}', 'Cliente Sem IA')
    on conflict (telefone) do update set nome = excluded.nome returning id;`)
  const pedido = await sql(`
    insert into public.pedidos
      (cliente_nome, cliente_telefone, cliente_id, subtotal_centavos, total_centavos,
       forma_pagamento, status, tipo_entrega)
    values ('Cliente Sem IA', '${TELEFONE}', '${cliente[0].id}', 3200, 3200,
       'local', 'pronto', 'retirada')
    returning numero;`)

  const status = await conversar('cade meu pedido?')
  const numero = String(pedido[0].numero).padStart(3, '0')
  conferir(status.includes(numero), `diz o número do pedido (#${numero})`)
  conferir(/pronto/i.test(status), 'diz o status certo, lido do banco')

  console.log('\n4) O que ele NÃO tenta resolver')
  const humano = await conversar('quero reclamar, veio errado')
  conferir(/equipe|instante|alguém/i.test(humano), 'reclamação: chama a equipe')

  const assumida = await sql(
    `select humano_assumiu from public.conversas_whatsapp where telefone = '${TELEFONE}';`
  )
  conferir(assumida[0]?.humano_assumiu === true, 'conversa fica marcada como "com a equipe"')

  const depois = await conversar('alo?')
  conferir(depois === '', 'com a equipe na conversa, o robô não fala mais nada')

  console.log('\n5) Nunca cria pedido')
  await sql(
    `update public.conversas_whatsapp set humano_assumiu = false where telefone = '${TELEFONE}';`
  )
  await conversar('me ve 3 marmitas de frango pra entrega, pago em dinheiro')
  const criados = await sql(
    `select count(*)::int as n from public.pedidos where cliente_telefone like '%${TELEFONE}%';`
  )
  conferir(criados[0]?.n === 1, 'continua com só o pedido que veio do site — nada foi anotado')
} catch (erro) {
  falha(`quebrou no meio: ${erro.message}`)
} finally {
  derrubar(app)
  await sql('update public.configuracoes set agente_whatsapp_ativo = false where id = 1;')
  await sql(`delete from public.pedidos where cliente_telefone like '%${TELEFONE}%';`)
  await sql(`delete from public.clientes where telefone = '${TELEFONE}';`)
  await sql(`delete from public.conversas_whatsapp where telefone = '${TELEFONE}';`)
}

console.log(`\n${'='.repeat(52)}`)
console.log(`  ${passos} verificações ok, ${falhas} falha(s)`)
console.log('='.repeat(52))
process.exit(falhas ? 1 : 0)
