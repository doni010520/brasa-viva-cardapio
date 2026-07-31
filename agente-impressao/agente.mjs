#!/usr/bin/env node
/**
 * Agente de impressão da Churrascaria Brasa Viva.
 *
 * Roda num PC do restaurante. De poucos em poucos segundos ele pergunta ao
 * sistema se tem comanda nova e manda para a impressora térmica.
 *
 * Existe porque o sistema roda na nuvem e a impressora está na cozinha:
 * o servidor não alcança a rede da loja. Este programa faz a ponte.
 *
 * Nada de dependência externa: só o Node.
 *
 * Uso:  node agente.mjs
 * Configuração: arquivo .env nesta mesma pasta (veja .env.exemplo)
 */
import { createConnection } from 'node:net'
import { spawn } from 'node:child_process'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------ configuração
const cfg = { ...process.env }
try {
  for (const linha of (await readFile(join(aqui, '.env'), 'utf8')).split('\n')) {
    const t = linha.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) cfg[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
} catch {
  // sem .env: usa só as variáveis do sistema
}

const URL_BASE = (cfg.URL_SISTEMA || '').replace(/\/$/, '')
const TOKEN = cfg.TOKEN_IMPRESSAO || ''
const TIPO = (cfg.IMPRESSORA_TIPO || 'windows').toLowerCase()
const INTERVALO = Math.max(2, Number(cfg.INTERVALO_SEGUNDOS || 4)) * 1000

if (!URL_BASE || !TOKEN) {
  console.error(
    'Faltam URL_SISTEMA e TOKEN_IMPRESSAO.\n' +
      'Crie um arquivo .env nesta pasta (copie de .env.exemplo).'
  )
  process.exit(1)
}

const agora = () => new Date().toLocaleTimeString('pt-BR')
const log = (m) => console.log(`[${agora()}] ${m}`)
const erro = (m) => console.error(`[${agora()}] ERRO: ${m}`)

// ------------------------------------------------------------ impressoras

/**
 * Cada comanda chega com um destino ("via"): 'viagem' para entrega/retirada,
 * 'salao' para pedidos de mesa. Se o .env tiver IMPRESSORA_VIA_VIAGEM ou
 * IMPRESSORA_VIA_SALAO, a via sai na impressora indicada; sem o mapa, tudo
 * cai na impressora padrão — via nova ou antiga nunca deixa de imprimir.
 */
function impressoraDaVia(via) {
  return cfg[`IMPRESSORA_VIA_${String(via || '').toUpperCase()}`] || null
}

/** Impressora ligada na rede (a maioria das térmicas usa a porta 9100). */
function imprimirNaRede(bytes, alvo) {
  // o mapa da via aceita "192.168.0.50" ou "192.168.0.50:9100"
  const [hostDaVia, portaDaVia] = (alvo || '').split(':')
  const host = hostDaVia || cfg.IMPRESSORA_HOST
  const porta = Number(portaDaVia || cfg.IMPRESSORA_PORTA || 9100)
  if (!host) throw new Error('IMPRESSORA_HOST não configurado')

  return new Promise((resolve, reject) => {
    const conexao = createConnection({ host, port: porta, timeout: 15000 }, () => {
      conexao.write(Buffer.from(bytes), () => conexao.end())
    })
    conexao.on('close', resolve)
    conexao.on('error', reject)
    conexao.on('timeout', () => {
      conexao.destroy()
      reject(new Error('a impressora não respondeu'))
    })
  })
}

/**
 * Impressora instalada no Windows (USB ou compartilhada).
 * Manda os bytes crus com `copy /b`, que é o jeito que funciona sem driver.
 */
async function imprimirNoWindows(bytes, alvo) {
  const nome = alvo || cfg.IMPRESSORA_NOME
  if (!nome) throw new Error('IMPRESSORA_NOME não configurado')

  const arquivo = join(tmpdir(), `comanda-${Date.now()}.bin`)
  await writeFile(arquivo, Buffer.from(bytes))

  try {
    await new Promise((resolve, reject) => {
      // \\localhost\NOME funciona para impressora compartilhada;
      // para USB direto, compartilhe a impressora com esse nome.
      const destino = nome.startsWith('\\\\') ? nome : `\\\\localhost\\${nome}`
      const p = spawn('cmd', ['/c', 'copy', '/b', arquivo, destino], { windowsHide: true })

      let saida = ''
      p.stderr.on('data', (d) => (saida += d))
      p.stdout.on('data', (d) => (saida += d))
      p.on('close', (codigo) =>
        codigo === 0 ? resolve() : reject(new Error(saida.trim() || `copy saiu com ${codigo}`))
      )
      p.on('error', reject)
    })
  } finally {
    await unlink(arquivo).catch(() => {})
  }
}

/**
 * Tira os códigos de controle da impressora e devolve só o texto.
 *
 * O .bin é o que a impressora entende, mas é ilegível para gente. Como o modo
 * arquivo existe justamente para quem AINDA NÃO TEM impressora, ele grava os
 * dois: o .bin (fiel ao que sairia no papel) e um .txt que dá para abrir e ler.
 */
function textoLegivel(bytes) {
  const ESC = 0x1b
  const GS = 0x1d
  let saida = ''

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]

    if (b === ESC) {
      const comando = bytes[i + 1]
      // ESC @ (inicializa) não tem parâmetro; ESC a/E/d têm um byte
      i += comando === 0x40 ? 1 : 2
      continue
    }
    if (b === GS) {
      const comando = bytes[i + 1]
      // GS V (corte) tem dois parâmetros; GS ! (tamanho) tem um
      i += comando === 0x56 ? 3 : 2
      if (comando === 0x56) saida += '\n' + '─'.repeat(42) + '  ✂\n'
      continue
    }

    if (b === 0x0a) saida += '\n'
    else if (b >= 0x20) saida += String.fromCharCode(b)
  }

  return saida
}

/** Só escreve em arquivo. Serve para testar sem impressora nenhuma. */
async function imprimirEmArquivo(bytes, id, via) {
  const pasta = cfg.PASTA_SAIDA || aqui
  const sufixo = via ? `-${via}` : ''
  const bin = join(pasta, `comanda-${id}${sufixo}.bin`)
  const txt = join(pasta, `comanda-${id}${sufixo}.txt`)

  await writeFile(bin, Buffer.from(bytes))
  await writeFile(txt, textoLegivel(bytes), 'utf8')

  log(`  (modo arquivo) gravado em ${txt}`)
  // No teste, ver a comanda na tela vale mais que abrir o arquivo.
  if (cfg.MOSTRAR_NA_TELA !== 'nao') {
    console.log('\n' + textoLegivel(bytes) + '\n')
  }
}

async function imprimir(bytes, id, via) {
  const alvo = impressoraDaVia(via)
  if (TIPO === 'rede') return imprimirNaRede(bytes, alvo)
  if (TIPO === 'arquivo') return imprimirEmArquivo(bytes, id, via)
  return imprimirNoWindows(bytes, alvo)
}

// ------------------------------------------------------------ laço principal
async function pegarFila() {
  const resposta = await fetch(`${URL_BASE}/api/impressao/fila`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!resposta.ok) throw new Error(`fila respondeu ${resposta.status}`)
  return (await resposta.json()).comandas ?? []
}

async function confirmar(resultados) {
  if (!resultados.length) return
  await fetch(`${URL_BASE}/api/impressao/fila`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultados }),
    signal: AbortSignal.timeout(20000),
  })
}

let falhasSeguidas = 0

async function rodada() {
  let comandas
  try {
    comandas = await pegarFila()
    falhasSeguidas = 0
  } catch (e) {
    falhasSeguidas++
    // não enche o log quando a internet cai: avisa no começo e a cada 15
    if (falhasSeguidas === 1 || falhasSeguidas % 15 === 0) {
      erro(`não consegui falar com o sistema (${e.message}). Tentando de novo...`)
    }
    return
  }

  if (!comandas.length) return

  const resultados = []
  for (const comanda of comandas) {
    const bytes = Buffer.from(comanda.escpos, 'base64')
    try {
      await imprimir(bytes, comanda.pedido, comanda.via)
      const alvo = impressoraDaVia(comanda.via)
      log(`Pedido #${comanda.pedido} impresso (${comanda.via}${alvo ? ` → ${alvo}` : ''})`)
      resultados.push({ id: comanda.id, ok: true })
    } catch (e) {
      erro(`pedido #${comanda.pedido}: ${e.message}`)
      resultados.push({ id: comanda.id, ok: false, erro: String(e.message).slice(0, 300) })
    }
  }

  await confirmar(resultados).catch((e) => erro(`não consegui confirmar: ${e.message}`))
}

console.log('======================================================')
console.log('  Agente de impressão — Churrascaria Brasa Viva')
console.log('======================================================')
console.log(`  Sistema...: ${URL_BASE}`)
console.log(`  Impressora: ${TIPO}${TIPO === 'rede' ? ` (${cfg.IMPRESSORA_HOST}:${cfg.IMPRESSORA_PORTA || 9100})` : TIPO === 'windows' ? ` (${cfg.IMPRESSORA_NOME})` : ''}`)
for (const chave of Object.keys(cfg).filter((c) => c.startsWith('IMPRESSORA_VIA_'))) {
  console.log(`  Via ${chave.slice('IMPRESSORA_VIA_'.length).toLowerCase()}: ${cfg[chave]}`)
}
console.log(`  Verificando a cada ${INTERVALO / 1000}s`)
console.log('  Deixe esta janela aberta. Ctrl+C para parar.')
console.log('======================================================\n')

await rodada()
setInterval(rodada, INTERVALO)
