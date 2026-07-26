import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { criarClienteAdmin } from './supabase/server'
import { apenasDigitos } from './format'
import { enviarCodigoAcesso, whatsappConfigurado } from './whatsapp'
import type { Cliente } from './types'

/**
 * Login do cliente: o WhatsApp é o usuário, um código de 6 dígitos é a senha.
 *
 * Ninguém escolhe senha, ninguém confirma e-mail, ninguém preenche cadastro —
 * o cadastro já nasceu sozinho no primeiro pedido. O código existe por um
 * motivo só: provar que o telefone é de quem está digitando. Sem ele,
 * qualquer pessoa que soubesse o número de alguém veria o nome, o endereço
 * de entrega e o histórico de compras daquela pessoa.
 */

export const COOKIE_CLIENTE = 'bv_cliente'

const VALIDADE_CODIGO_MIN = 10
/** 90 dias: quem pede almoço uma vez por semana nunca mais vê tela de login. */
const VALIDADE_SESSAO_DIAS = 90
const MAX_TENTATIVAS = 5
/** Freio contra quem fica pedindo código para o número dos outros. */
const MAX_CODIGOS_POR_HORA = 5

function digest(valor: string) {
  return createHash('sha256').update(valor).digest('hex')
}

/**
 * O telefone entra no hash junto com o código. Assim um código sorteado para
 * um número não vale para outro, mesmo que os seis dígitos calhem de bater.
 */
function hashDoCodigo(telefone: string, codigo: string) {
  return digest(`${telefone}:${codigo}`)
}

/** Comparação de tempo constante: evita descobrir o código medindo a resposta. */
function iguais(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Normaliza para a mesma forma que a tabela `clientes` usa: só dígitos. */
export function telefoneNormalizado(entrada: string) {
  const digitos = apenasDigitos(entrada).replace(/^55/, '')
  // DDD + 8 ou 9 dígitos
  return digitos.length === 10 || digitos.length === 11 ? digitos : null
}

/**
 * Só para demonstração: sem WhatsApp conectado, o código aparece na tela.
 * Isso derruba a proteção inteira — com a chave ligada, qualquer um entra
 * como qualquer um. Existe para o dono ver o fluxo funcionando antes de
 * conectar a uazapi, e a tela avisa disso em letras garrafais.
 */
export function modoDemonstracaoDeCodigo() {
  return process.env.PERMITIR_CODIGO_NA_TELA === '1' && !whatsappConfigurado()
}

type ResultadoPedirCodigo =
  | { ok: true; canal: 'whatsapp' }
  | { ok: true; canal: 'tela'; codigo: string }
  | { ok: false; erro: string }

export async function pedirCodigo(
  entrada: string,
  nomeLoja: string
): Promise<ResultadoPedirCodigo> {
  const telefone = telefoneNormalizado(entrada)
  if (!telefone) return { ok: false, erro: 'Confira o número: precisa ter DDD e o número todo.' }

  const supabase = criarClienteAdmin()
  await supabase.rpc('limpa_acessos_vencidos')

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('codigos_acesso')
    .select('id', { count: 'exact', head: true })
    .eq('telefone', telefone)
    .gte('criado_em', umaHoraAtras)

  if ((count ?? 0) >= MAX_CODIGOS_POR_HORA) {
    return { ok: false, erro: 'Muitos códigos pedidos para este número. Tente de novo mais tarde.' }
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')

  const { error } = await supabase.from('codigos_acesso').insert({
    telefone,
    codigo_hash: hashDoCodigo(telefone, codigo),
    expira_em: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000).toISOString(),
  })
  if (error) return { ok: false, erro: 'Não consegui gerar o código agora. Tente de novo.' }

  if (modoDemonstracaoDeCodigo()) return { ok: true, canal: 'tela', codigo }

  const enviado = await enviarCodigoAcesso(telefone, codigo, nomeLoja)
  if (!enviado) {
    return {
      ok: false,
      erro: 'Não consegui enviar o código pelo WhatsApp. Confira o número ou fale com a loja.',
    }
  }

  return { ok: true, canal: 'whatsapp' }
}

type ResultadoConfirmar = { ok: true } | { ok: false; erro: string }

export async function confirmarCodigo(
  entrada: string,
  codigoDigitado: string
): Promise<ResultadoConfirmar> {
  const telefone = telefoneNormalizado(entrada)
  const codigo = apenasDigitos(codigoDigitado)
  if (!telefone || codigo.length !== 6) return { ok: false, erro: 'Código inválido.' }

  const supabase = criarClienteAdmin()

  const { data: registro } = await supabase
    .from('codigos_acesso')
    .select('id, codigo_hash, expira_em, tentativas, usado_em')
    .eq('telefone', telefone)
    .is('usado_em', null)
    .gt('expira_em', new Date().toISOString())
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!registro) return { ok: false, erro: 'Código expirado. Peça um novo.' }

  if (registro.tentativas >= MAX_TENTATIVAS) {
    // queima o código: força pedir outro em vez de deixar tentar 1 milhão de vezes
    await supabase
      .from('codigos_acesso')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', registro.id)
    return { ok: false, erro: 'Errou o código vezes demais. Peça um novo.' }
  }

  if (!iguais(registro.codigo_hash, hashDoCodigo(telefone, codigo))) {
    await supabase
      .from('codigos_acesso')
      .update({ tentativas: registro.tentativas + 1 })
      .eq('id', registro.id)
    return { ok: false, erro: 'Código errado. Confira a mensagem do WhatsApp.' }
  }

  // código só vale uma vez
  await supabase
    .from('codigos_acesso')
    .update({ usado_em: new Date().toISOString() })
    .eq('id', registro.id)

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('telefone', telefone)
    .maybeSingle()

  const token = randomBytes(32).toString('hex')
  const expiraEm = new Date(Date.now() + VALIDADE_SESSAO_DIAS * 24 * 60 * 60 * 1000)

  await supabase.from('sessoes_cliente').insert({
    token_hash: digest(token),
    cliente_id: cliente?.id ?? null,
    telefone,
    expira_em: expiraEm.toISOString(),
  })

  const bau = await cookies()
  bau.set(COOKIE_CLIENTE, token, {
    httpOnly: true, // fora do alcance de qualquer JavaScript da página
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  })

  return { ok: true }
}

export type SessaoCliente = {
  telefone: string
  clienteId: string | null
  nome: string | null
}

/** Quem está logado agora, se alguém estiver. Devolve null sem reclamar. */
export async function clienteAtual(): Promise<SessaoCliente | null> {
  const token = (await cookies()).get(COOKIE_CLIENTE)?.value
  if (!token) return null

  const supabase = criarClienteAdmin()
  const { data: sessao } = await supabase
    .from('sessoes_cliente')
    .select('id, cliente_id, telefone, expira_em')
    .eq('token_hash', digest(token))
    .maybeSingle()

  if (!sessao) return null
  if (new Date(sessao.expira_em) < new Date()) {
    await supabase.from('sessoes_cliente').delete().eq('id', sessao.id)
    return null
  }

  // o cliente pode ter nascido depois da sessão (primeiro pedido veio depois)
  let clienteId = sessao.cliente_id as string | null
  let nome: string | null = null

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('telefone', sessao.telefone)
    .maybeSingle()

  if (cliente) {
    nome = cliente.nome
    if (clienteId !== cliente.id) {
      clienteId = cliente.id
      await supabase.from('sessoes_cliente').update({ cliente_id: cliente.id }).eq('id', sessao.id)
    }
  }

  return { telefone: sessao.telefone, clienteId, nome }
}

/** Dados do cadastro para preencher o checkout sozinho. */
export async function cadastroDoClienteLogado(): Promise<Cliente | null> {
  const sessao = await clienteAtual()
  if (!sessao?.clienteId) return null

  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', sessao.clienteId)
    .maybeSingle()

  return (data as Cliente) ?? null
}

export async function encerrarSessaoCliente() {
  const bau = await cookies()
  const token = bau.get(COOKIE_CLIENTE)?.value

  if (token) {
    await criarClienteAdmin().from('sessoes_cliente').delete().eq('token_hash', digest(token))
  }
  bau.delete(COOKIE_CLIENTE)
}
