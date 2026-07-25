-- =============================================================
-- Pagamento por API (Checkout Transparente do Mercado Pago):
-- Pix com QR na própria tela, cartão de crédito e boleto.
-- Substitui o antigo redirecionamento para o Checkout Pro.
-- Rodar depois de 0001, 0002 e 0003.
-- =============================================================

-- ------------------------------------------- o que a loja aceita
-- Boleto ficou de fora de propósito: leva de 1 a 3 dias úteis para compensar,
-- e ninguém almoça hoje pagando um boleto que cai na quinta.
alter table public.configuracoes
  add column if not exists aceita_pix     boolean not null default true,
  add column if not exists aceita_cartao  boolean not null default true,
  -- minutos até o Pix expirar
  add column if not exists pix_expira_min int not null default 30;

-- ------------------------------------------------------ pedidos
alter table public.pedidos
  -- o Mercado Pago exige e-mail do pagador; CPF é exigido em Pix e boleto
  add column if not exists cliente_email      text,
  add column if not exists cliente_cpf        text,
  -- qual meio o cliente de fato escolheu: 'pix' | 'master' | 'visa' | ...
  add column if not exists metodo_pagamento   text,
  -- Pix: guardamos só o "copia e cola" (EMV). O QR é desenhado na hora,
  -- para não encher o banco com imagem em base64 a cada pedido.
  add column if not exists pix_copia_cola     text,
  add column if not exists pix_expira_em      timestamptz,
  -- motivo da recusa, para o dono conseguir explicar ao cliente
  add column if not exists pagamento_detalhe  text;

-- Se este banco chegou a receber as colunas de boleto numa versão anterior,
-- some com elas.
alter table public.configuracoes drop column if exists aceita_boleto;
alter table public.pedidos       drop column if exists boleto_url;

-- O Checkout Pro não é mais usado; a coluna fica para não perder histórico.
comment on column public.pedidos.mp_preference_id is
  'Legado do Checkout Pro. O fluxo atual cria o pagamento direto pela API.';

comment on column public.pedidos.pix_copia_cola is
  'Código EMV do Pix. O QR é gerado a partir daqui na renderização.';

-- Busca dos pagamentos pendentes de Pix que já venceram
create index if not exists pedidos_pix_expira_idx
  on public.pedidos (pix_expira_em)
  where status_pagamento = 'pendente' and pix_expira_em is not null;
