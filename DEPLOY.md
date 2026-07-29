# Subir no EasyPanel

Passo a passo para colocar o sistema no ar na VPS.

---

## Antes de começar

O banco **já está pronto** — é o mesmo projeto Supabase usado nos testes, com
as 11 migrações rodadas. Não precisa refazer nada no banco para o deploy.
Os valores exatos estão no seu `.env.local`, que nunca vai para o git.

Você vai precisar de:

- um domínio (ex.: `cardapio.brasaviva.com.br`) apontando para a VPS
- as 3 chaves do Supabase (as mesmas do seu `.env.local`)

---

## 1. Criar o app

No EasyPanel, no seu projeto:

**Create Service → App**

| Campo | Valor |
|---|---|
| Name | `brasa-viva-cardapio` |

Na aba **Source**:

| Campo | Valor |
|---|---|
| Type | GitHub |
| Repository | `doni010520/brasa-viva-cardapio` |
| Branch | `main` |
| Build Path | `/` |

> Se o EasyPanel ainda não tem acesso à sua conta do GitHub, ele pede a
> autorização nesta tela.

Na aba **Build**:

| Campo | Valor |
|---|---|
| Method | **Dockerfile** |
| File | `Dockerfile` |

---

## 2. Build Arguments (a parte que mais dá erro)

Ainda na aba **Build**, em *Build Arguments*.

**Isto não é opcional.** Tudo que começa com `NEXT_PUBLIC_` é **gravado dentro
do código no momento do build**. Configurar só em "Environment" não funciona:
o app compila sem esses valores e depois aponta para `localhost`.

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<a chave anon do .env.local>
NEXT_PUBLIC_URL_BASE=https://SEU-DOMINIO
NEXT_PUBLIC_FUSO_HORARIO=America/Sao_Paulo
```

Se um dia ligar o Mercado Pago, a chave pública dele também entra aqui:

```
NEXT_PUBLIC_MP_PUBLIC_KEY=<Public Key do Mercado Pago>
```

> Trocar qualquer um destes valores **exige rebuild**, não basta reiniciar.

---

## 3. Environment

Na aba **Environment**, as variáveis que ficam só no servidor:

```
SUPABASE_SERVICE_ROLE_KEY=<a chave service_role do .env.local>

NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<a mesma chave anon>
NEXT_PUBLIC_URL_BASE=https://SEU-DOMINIO
NEXT_PUBLIC_FUSO_HORARIO=America/Sao_Paulo

TOKEN_IMPRESSAO=<invente uma senha longa; a mesma vai no agente do restaurante>
```

Sim, as `NEXT_PUBLIC_*` aparecem **nos dois lugares**. No Build para entrarem
no código do navegador; no Environment para o servidor também enxergar.

Deixe em branco por enquanto (o app funciona sem):

```
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
UAZAPI_URL=
UAZAPI_TOKEN=
```

O cliente entra no histórico dele com um código de 6 dígitos que chega no WhatsApp.
Enquanto a uazapi **não** estiver conectada, esse código não tem como sair — então, só
para a demonstração, adicione:

```
PERMITIR_CODIGO_NA_TELA=1
```

⚠️ Ligada, ela derruba a proteção: qualquer pessoa digita o número de outra e vê o
histórico dela. **Apague no dia em que a loja abrir para o público.** Preenchendo
`UAZAPI_URL`/`UAZAPI_TOKEN` a chave passa a ser ignorada sozinha.

Para ligar o **atendimento automático no WhatsApp**, adicione também:

```
WHATSAPP_WEBHOOK_TOKEN=<invente uma senha longa>
```

E, **se quiser** que o chatbot use IA (ele funciona sem, respondendo por palavra-chave):

```
OPENAI_API_KEY=<ou ANTHROPIC_API_KEY, uma das duas>
```

⚠️ O `WHATSAPP_WEBHOOK_TOKEN` protege um endereço que é público na internet e
**fecha pedido de verdade**. Sem ele preenchido o webhook responde 401 para
todo mundo — de propósito. Depois, na uazapi, cadastre o webhook
`https://SEU-DOMINIO/api/whatsapp/webhook` com esse token no cabeçalho
`x-webhook-token`, e ligue a chave em *WhatsApp* no painel (ela nasce
desligada).

⚠️ A **service_role** é a chave de administrador do banco: ela ignora todas as
regras de segurança. Ela só pode existir aqui e no seu `.env.local`.

---

## 4. Domínio

Aba **Domains → Add Domain**:

| Campo | Valor |
|---|---|
| Host | `cardapio.brasaviva.com.br` |
| Port | **3000** |
| HTTPS | **ligado** |

O EasyPanel emite o certificado sozinho. Antes disso, o DNS do domínio precisa
estar apontando para o IP da VPS.

---

## 5. Deploy

Clique em **Deploy** e acompanhe o log. O primeiro build leva alguns minutos.

---

## 6. Conferir se subiu certo

Abra no navegador:

```
https://SEU-DOMINIO/api/saude
```

Deve responder algo assim:

```json
{
  "ok": true,
  "servico": "cardapio-brasa-viva",
  "configurado": {
    "supabase": true,
    "chave_de_servico": true,
    "url_base": "https://SEU-DOMINIO",
    "url_base_e_producao": true,
    "mercado_pago": false,
    "impressao": true
  }
}
```

**O campo que mais importa é `url_base`.** Se aparecer vazio ou com
`localhost`, faltou passar `NEXT_PUBLIC_URL_BASE` como **Build Argument** —
e aí os links de pagamento e de acompanhamento sairiam errados.

Depois, confira as três telas:

| Endereço | O que esperar |
|---|---|
| `https://SEU-DOMINIO` | pergunta "Você está no restaurante agora?" |
| `https://SEU-DOMINIO/admin` | tela de login |
| `https://SEU-DOMINIO/mesa/1` | abre o cardápio do salão, Mesa 1 |

Entre no painel com o e-mail do dono. **Troque a senha assim que entrar**, em
*Equipe → ícone da chave* — a senha atual foi usada em ambiente de teste.

---

## 7. Ajustes obrigatórios no painel

Antes de divulgar, em **Configurações**:

- [ ] **Endereço da churrascaria** (hoje está com o texto de exemplo)
- [ ] **Telefone e WhatsApp** reais
- [ ] **Horário de funcionamento** de cada dia
- [ ] **Bairros e taxas** de entrega
- [ ] **Link do Instagram**, se for usar a campanha do bombom
- [ ] Apagar `PERMITIR_CODIGO_NA_TELA` do Environment (ou conectar a uazapi)

Em **Cardápio**, troque as fotos: as atuais são de banco de imagens, só para
apresentação. As reais dos pratos ficam muito melhores — e evitam qualquer
questão de direito de imagem de terceiros.

Em **Mesas**, imprima os QR Codes e cole nas mesas.

---

## 8. Ligar a impressão automática

No PC do restaurante:

1. Copie a pasta `agente-impressao` para lá.
2. Instale o [Node.js](https://nodejs.org).
3. Copie `.env.exemplo` para `.env` e preencha:
   - `URL_SISTEMA=https://SEU-DOMINIO`
   - `TOKEN_IMPRESSAO=` o mesmo valor que você pôs no EasyPanel
   - o bloco da impressora
4. Dois cliques em `iniciar.bat`.

Detalhes em [agente-impressao/README.md](agente-impressao/README.md).

---

## Trocar o domínio

O domínio não está escrito em lugar nenhum do código: tudo sai de
`NEXT_PUBLIC_URL_BASE`. Trocar é configuração — mas na ordem certa.

1. **DNS, no painel do domínio.** Aponte o registro **A** de `@` para o IP da
   VPS (o mesmo endereço em que você acessa o EasyPanel). Domínio recém-comprado
   costuma vir com esse A no IP de estacionamento da registradora — é ele que
   sai. Mantenha o **CNAME** de `www` apontando para o domínio raiz. Espere
   propagar antes do passo 2, senão a emissão do certificado falha.

2. **EasyPanel → Domains.** Adicione o domínio e o `www`, porta **3000**,
   HTTPS ligado.

   ⚠️ **NÃO remova o domínio antigo.** Os QR Codes já colados nas mesas e os
   links já enviados no WhatsApp apontam para ele. Deixe os dois no ar.

3. **Build Arguments** — é aqui que essa troca costuma dar errado:

   ```
   NEXT_PUBLIC_URL_BASE=https://SEU-DOMINIO
   ```

   Atualize **também** no Environment. E **precisa de rebuild**: reiniciar não
   basta, porque toda `NEXT_PUBLIC_*` é gravada dentro do código no build.

4. **Deploy** e confira em `https://SEU-DOMINIO/api/saude` se `url_base` já é
   o domínio novo. Se ainda for o antigo, o rebuild não pegou o argumento.

5. **Reimprima os QR das mesas** (*Mesas → imprimir*). Eles são desenhados na
   hora, então já saem com o domínio novo.

O que muda junto, sem você fazer nada: link de acompanhamento no WhatsApp,
link que o chatbot manda, links de pagamento e a imagem de prévia do link.

Para conferir de ponta a ponta — ele lê o QR pelos pixels, como uma câmera
faria, e segue o endereço que sair de lá:

```bash
node scripts/conferir-qr-mesa.mjs 1 https://SEU-DOMINIO
```

---


## Atualizar depois

Todo `git push` na branch `main` pode virar deploy: no EasyPanel, ligue
**Auto Deploy**, ou clique em **Deploy** manualmente.

Se a mudança envolver alguma variável `NEXT_PUBLIC_*`, atualize também o
**Build Argument** — senão o valor antigo continua gravado na imagem.

---

## Quando algo der errado

| Sintoma | Causa provável |
|---|---|
| Tela "O sistema ainda não foi configurado" | Faltou `SUPABASE_SERVICE_ROLE_KEY` no Environment |
| Links de pagamento apontando para `localhost` | `NEXT_PUBLIC_URL_BASE` não foi passada como Build Argument |
| Cardápio vazio | Está apontando para outro projeto Supabase, sem as migrações |
| Painel devolve para o login sem parar | Cookie de sessão sem HTTPS. Ligue o HTTPS no domínio |
| Comanda não imprime | Agente parado no PC, ou `TOKEN_IMPRESSAO` diferente dos dois lados |
| Build falha em `npm ci` | `package-lock.json` fora de sincronia; rode `npm install` e faça commit |
