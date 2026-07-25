/**
 * Cria (ou atualiza a senha de) um usuário do painel.
 *
 * Uso:  node scripts/criar-admin.mjs email@dominio.com "senha"
 */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const linha of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const limpa = linha.trim()
  if (!limpa || limpa.startsWith('#')) continue
  const igual = limpa.indexOf('=')
  if (igual < 1) continue
  env[limpa.slice(0, igual).trim()] = limpa.slice(igual + 1).trim()
}

const [email, senha] = process.argv.slice(2)
if (!email || !senha) {
  console.error('Uso: node scripts/criar-admin.mjs email@dominio.com "senha"')
  process.exit(1)
}

const base = env.NEXT_PUBLIC_SUPABASE_URL
const chave = env.SUPABASE_SERVICE_ROLE_KEY
const cabecalhos = {
  apikey: chave,
  Authorization: `Bearer ${chave}`,
  'Content-Type': 'application/json',
}

// já existe?
const lista = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=200`, {
  headers: cabecalhos,
}).then((r) => r.json())

const existente = (lista.users ?? []).find((u) => u.email === email)

if (existente) {
  const resposta = await fetch(`${base}/auth/v1/admin/users/${existente.id}`, {
    method: 'PUT',
    headers: cabecalhos,
    body: JSON.stringify({ password: senha, email_confirm: true }),
  })
  if (!resposta.ok) {
    console.error('Falha ao atualizar:', await resposta.text())
    process.exit(1)
  }
  console.log(`Senha atualizada para ${email}`)
} else {
  const resposta = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: 'Administrador' },
    }),
  })
  if (!resposta.ok) {
    console.error('Falha ao criar:', await resposta.text())
    process.exit(1)
  }
  console.log(`Usuário criado: ${email}`)
}

// o trigger do banco deve ter espelhado o usuário em public.admins
const admins = await fetch(`${base}/rest/v1/admins?select=email`, {
  headers: cabecalhos,
}).then((r) => r.json())

console.log('Admins liberados no painel:', admins.map((a) => a.email).join(', ') || '(nenhum)')
