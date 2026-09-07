/**
 * Gera o par de chaves VAPID — a identidade do restaurante perante os
 * servidores de push do Google, da Apple e da Mozilla.
 *
 * Uso:  node scripts/gerar-chaves-push.mjs
 *
 * Rode UMA VEZ e guarde o resultado. Trocar as chaves depois derruba todos os
 * avisos já ligados: cada aparelho ficou inscrito com a chave antiga e nunca
 * mais recebe nada, sem erro nenhum aparecer. Se um dia precisar trocar, os
 * clientes têm que tocar em "me avise" de novo.
 *
 * A pública vai para o navegador (por isso NEXT_PUBLIC_) e a privada é
 * segredo de servidor — quem tiver as duas consegue mandar aviso no celular
 * dos seus clientes em nome do restaurante.
 */
import webpush from 'web-push'

const chaves = webpush.generateVAPIDKeys()

console.log(`
Cole no .env.local (e no EasyPanel — veja o DEPLOY.md):

# ---------------------------------------------------------------
# Avisos no celular (Web Push). A pública TAMBÉM vai em Build Arguments.
# ---------------------------------------------------------------
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${chaves.publicKey}
VAPID_PRIVATE_KEY=${chaves.privateKey}
`)
