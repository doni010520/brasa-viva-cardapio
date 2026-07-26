# Cardápio Online — Churrascaria Brasa Viva

Sistema de pedidos para retirada no balcão: o cliente monta o pedido pelo celular,
paga (Pix/cartão pelo Mercado Pago ou na retirada) e acompanha o preparo em tempo real.
O dono controla cardápio, preços, horários, cupons e pedidos por um painel próprio.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Storage) · Mercado Pago

---

## Como colocar no ar

### 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto (região **South America (São Paulo)**).
2. Abra **SQL Editor** e rode, nesta ordem:
   - `supabase/migrations/0001_schema.sql` — tabelas, índices, RLS e o bucket de imagens
   - `supabase/migrations/0002_seed_exemplo.sql` — cardápio inicial da Brasa Viva (opcional)
   - `supabase/migrations/0003_entrega.sql` — entrega por bairro (taxa, endereço, status "em rota")
   - `supabase/migrations/0004_pagamento_api.sql` — pagamento por API (Pix e cartão no site)
3. Em **Project Settings → API**, copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` *(secreta — nunca no navegador nem no git)*

### 2. Criar o login do dono

Em **Authentication → Users → Add user**, crie o usuário com e-mail e senha e marque
*Auto Confirm User*. Todo usuário criado no Auth vira admin automaticamente (via trigger).
Como só quem tem acesso ao Supabase cria usuário, o painel fica restrito à equipe.

### 3. Rodar local

```bash
cp .env.example .env.local   # preencha com as credenciais
npm install
npm run dev
```

- Cardápio do cliente: http://localhost:3000
- Painel do restaurante: http://localhost:3000/admin

### 4. Deploy no EasyPanel

Passo a passo completo em **[DEPLOY.md](DEPLOY.md)**, incluindo a pegadinha
que mais derruba esse tipo de deploy: as variáveis `NEXT_PUBLIC_*` são
gravadas no **build**, então precisam ir em *Build Arguments* — configurar só
em *Environment* não basta.

Depois de subir, `https://SEU-DOMINIO/api/saude` diz o que está configurado e
o que faltou, sem expor nenhuma chave.

### 5. Ligar o Mercado Pago (opcional)

Sem isso o sistema funciona normalmente — só não aparece a opção de pagar online.

O pagamento é **Checkout Transparente**: o cliente paga dentro do site, sem ser
jogado para fora. Pix aparece como QR Code na própria tela; cartão de crédito é
um formulário no app. (Boleto ficou de fora de propósito: compensa em 1 a 3 dias
úteis, e ninguém almoça hoje pagando um boleto que cai na quinta.)

1. Em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) → **Suas integrações**,
   crie uma aplicação e copie, em *Credenciais de produção*:
   - **Access Token** → `MP_ACCESS_TOKEN` *(secreto, só no servidor)*
   - **Public Key** → `NEXT_PUBLIC_MP_PUBLIC_KEY` *(vai para o navegador, é pública mesmo)*
2. Em **Webhooks**, cadastre a URL `https://SEU-DOMINIO/api/webhooks/mercadopago`
   e marque o evento **Pagamentos**.
3. Copie a **assinatura secreta** → `MP_WEBHOOK_SECRET`.

Para testar antes de ir ao ar, use as **credenciais de teste** (mesma tela) e os
[cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/test/cards)
do Mercado Pago.

> **Dado de cartão nunca passa pelo nosso servidor.** O formulário tokeniza no
> navegador e só o token chega aqui — é o que nos mantém fora do escopo pesado de PCI.

> O webhook confere a assinatura, consulta o pagamento direto na API do Mercado Pago
> e compara o valor pago com o total do pedido antes de liberar para a cozinha.
> Como webhook atrasa (e em ambiente local nem chega), a tela do Pix também
> pergunta o status a cada 5 segundos e tem um botão "já paguei, conferir agora".

### 6. Ligar os avisos no WhatsApp (opcional)

Preencha `UAZAPI_URL` e `UAZAPI_TOKEN` com os dados da instância uazapi.
O cliente passa a receber mensagem automática quando o pedido é confirmado,
entra em preparo, fica pronto e sai para entrega.

Sem isso nada quebra: o painel continua abrindo a conversa do WhatsApp com um clique.
Falha no envio **nunca** derruba um pedido — é registrada no log e ignorada.

> Se algum número específico não receber, o suspeito de sempre é o **9º dígito**
> do celular. Comece a investigação por `numeroParaEnvio()` em `src/lib/whatsapp.ts`.

---

## Como o dono usa no dia a dia

| Tela | Para quê |
|---|---|
| **Pedidos** (`/admin`) | Painel da cozinha. Atualiza sozinho a cada 15s. Move o pedido por *Novos → Em preparo → Prontos → Em rota → Entregue/Retirado*. Tem a chave geral para fechar a loja na hora e o link da comanda para impressão. |
| **Cardápio** (`/admin/cardapio`) | Categorias, produtos, fotos, preços, promoção e grupos de opções (ponto da carne, adicionais, sabor). O botão **À venda / Esgotado** tira o item do ar num toque. |
| **Cupons** (`/admin/cupons`) | Cupons por porcentagem ou valor fixo, com mínimo, validade e limite de usos. |
| **Relatórios** (`/admin/relatorios`) | Faturamento, ticket médio, vendas por dia e ranking dos pratos nos últimos 30 dias. |
| **Configurações** (`/admin/config`) | Nome, logo, cor da marca, contato, tempo de preparo, pedido mínimo, formas de pagamento, horário de cada dia e os **bairros de entrega** com taxa e tempo. |
| **Comanda** (`/admin/comanda/[id]`) | Via de cozinha em 80mm, abre já chamando a impressão. Destaca observações em maiúsculas e o endereço nos pedidos de entrega. |

---

## Decisões que valem conhecer

**Dinheiro em centavos.** Todo valor é `integer` de centavos, do banco à interface.
Nada de `float` — é o que evita o clássico `R$ 38,899999`.

**O preço nunca vem do navegador.** O carrinho manda apenas *o que* foi escolhido (ids).
O servidor recalcula tudo a partir do banco em `src/lib/montar-pedido.ts`: preço, promoção,
disponibilidade e as regras de mínimo/máximo de cada grupo de opções. Sem isso, qualquer
pessoa fecharia um pedido de R$ 0,01 pelo DevTools.

**Pagamento online não pula a fila.** Pedido online nasce como `aguardando_pagamento` e só vira
`recebido` quando o pagamento é confirmado. Pedido para pagar na hora já entra direto na cozinha.

**O valor cobrado sai do banco, não do navegador.** Em `src/app/api/pagamentos/route.ts` o
`transaction_amount` é lido do pedido gravado. O que o navegador manda é apenas *o que* foi
escolhido e o token do cartão — nunca quanto custa.

**Status andam só para frente.** A máquina de transições em `src/app/admin/(painel)/acoes.ts`
não deixa um pedido "pronto" voltar para "recebido" por um toque errado no meio do corre.
Entrega ganha a etapa extra *saiu para entrega*; retirada pula direto para o fim.

**Entrega é opcional e por bairro.** A taxa vem do bairro cadastrado, nunca do cliente, e o
servidor reconfere na hora de fechar o pedido. Bairro fora da lista simplesmente não pede entrega.

**Fuso horário explícito.** O servidor roda em UTC, o restaurante não. Todo cálculo de
"está aberto agora" e de horários de retirada passa por `src/lib/tempo.ts`, no fuso da loja.
Horário que vira a madrugada (18:00 às 02:00) é tratado.

**O cliente entra sem senha, mas não entra sem prova.** O histórico dele fica em
`/meus-pedidos`. Sem login, a lista sai dos ids que o próprio navegador guardou na hora da
compra — funciona sozinho, mas some se trocar de celular. Para ver tudo de qualquer aparelho,
`/entrar` manda um código de 6 dígitos no WhatsApp: o número é o usuário, o código é a senha,
e ninguém decora nada. O código existe por um motivo só — sem ele, quem soubesse o telefone de
alguém veria o nome, o endereço de entrega e tudo que a pessoa já comprou. Código vale 10
minutos, uma vez só, no máximo 5 tentativas; o banco guarda apenas o hash dele e o hash do
token da sessão (`src/lib/cliente-sessao.ts`).

**RLS fechado por padrão.** A chave anônima só lê o cardápio. Pedidos, cupons e configurações
são escritos por server actions com `service_role`, e cada uma delas chama `exigirAdmin()` —
o `proxy.ts` é a primeira tranca, não a única.

---

## Estrutura

```
src/
├─ app/
│  ├─ (loja)/            cardápio, carrinho, checkout, acompanhamento do pedido
│  ├─ admin/(painel)/    pedidos, cardápio, cupons, relatórios, configurações
│  ├─ admin/login/       entrada do painel
│  └─ api/webhooks/      confirmação de pagamento do Mercado Pago
├─ components/
│  ├─ loja/              interface do cliente
│  ├─ admin/             interface do dono
│  └─ ui.tsx             botões, campos, cartões
├─ lib/
│  ├─ montar-pedido.ts   recálculo e validação do pedido no servidor
│  ├─ tempo.ts           fuso, horário de funcionamento, horários de retirada
│  ├─ cupons.ts          validação e consumo de cupom
│  ├─ mercadopago.ts     preferência de pagamento e consulta
│  └─ supabase/          clients (navegador, sessão, service role)
└─ proxy.ts              renova a sessão e protege /admin
```

---

## Próximos passos sugeridos

1. **Programa de fidelidade** simples por telefone do cliente.
2. **Pix direto** (sem Mercado Pago), gerando o QR Code na própria tela.
3. **Impressão automática** na térmica do balcão, sem alguém clicar (agente local ou QZ Tray).
4. **Cadastro de entregadores** e atribuição de pedido a cada um.
5. **Estoque por ingrediente**, para esgotar vários pratos de uma vez.
