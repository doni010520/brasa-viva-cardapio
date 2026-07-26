/**
 * Credenciais usadas pelos testes.
 *
 * Ficam no .env.local (que nunca vai para o git), nunca escritas no código:
 * o repositório é público, e senha de painel em arquivo versionado é senha
 * queimada.
 */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

export const env = {}
for (const linha of (await readFile(join(raiz, '.env.local'), 'utf8')).split('\n')) {
  const t = linha.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

export const EMAIL_ADMIN = env.TESTE_EMAIL_ADMIN ?? ''
export const SENHA_ADMIN = env.TESTE_SENHA_ADMIN ?? ''

if (!EMAIL_ADMIN || !SENHA_ADMIN) {
  console.error(
    'Faltam TESTE_EMAIL_ADMIN e TESTE_SENHA_ADMIN no .env.local.\n' +
      'São as credenciais do painel usadas pelos testes.'
  )
  process.exit(1)
}
