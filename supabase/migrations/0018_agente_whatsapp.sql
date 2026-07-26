-- Agente de IA que atende e fecha pedidos pelo WhatsApp.
--
-- O que ele NÃO faz, de propósito: calcular preço, decidir taxa de entrega,
-- aceitar dinheiro no entregador ou gravar pedido por conta própria. Ele só
-- escolhe IDs e chama ferramentas; quem soma, confere e grava é o mesmo
-- src/lib/criar-pedido.ts que o site usa. Modelo de linguagem erra conta —
-- e essa é a única parte que não pode errar.

-- ------------------------------------------------------------ conversas
create table if not exists public.conversas_whatsapp (
  id                uuid primary key default gen_random_uuid(),
  -- só dígitos, igual a clientes.telefone
  telefone          text not null unique,
  nome              text,

  -- transcrição em texto puro: [{ "papel": "cliente"|"agente", "texto": "..." }]
  -- O carrinho NÃO vive aqui. Estado de verdade fica em coluna, senão a conta
  -- passaria a depender de o modelo lembrar direito do que foi dito.
  mensagens         jsonb not null default '[]'::jsonb,

  -- carrinho em construção: [{ "produtoId", "quantidade", "opcaoIds", "observacao" }]
  carrinho          jsonb not null default '[]'::jsonb,

  tipo_entrega      text check (tipo_entrega in ('retirada', 'entrega')),
  bairro_id         uuid references public.bairros_entrega(id) on delete set null,
  endereco_rua      text,
  endereco_numero   text,
  endereco_complemento text,
  endereco_referencia  text,

  -- Quando um humano assume, a IA cala a boca e NÃO volta sozinha. Só o
  -- painel devolve a conversa para ela.
  humano_assumiu    boolean not null default false,
  humano_assumiu_em timestamptz,

  ultimo_pedido_id  uuid references public.pedidos(id) on delete set null,
  -- id da última mensagem tratada: webhook repete, e repetir vira pedido dobrado
  ultima_mensagem_id text,

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists conversas_whatsapp_atualizado_idx
  on public.conversas_whatsapp (atualizado_em desc);

-- Conversa de cliente tem nome, endereço e histórico de compra dentro.
-- RLS ligada e sem política nenhuma: só o servidor encosta.
alter table public.conversas_whatsapp enable row level security;

drop trigger if exists conversas_whatsapp_atualizado_em on public.conversas_whatsapp;
create trigger conversas_whatsapp_atualizado_em
  before update on public.conversas_whatsapp
  for each row execute function public.toca_atualizado_em();

-- ------------------------------------------------------- chaves do painel
alter table public.configuracoes
  -- nasce DESLIGADO: ninguém liga um robô atendendo cliente sem querer
  add column if not exists agente_whatsapp_ativo boolean not null default false,
  add column if not exists agente_nome text not null default 'Brasinha',
  -- o dono escreve aqui o jeito da casa; vai junto das regras fixas
  add column if not exists agente_instrucoes text;

update public.configuracoes
set agente_instrucoes = coalesce(agente_instrucoes,
  'Fale como baiano de Dias d''Ávila: simpático, direto e sem enrolação. ' ||
  'Pode chamar de "meu rei" e "minha rainha". Não invente prato que não está no cardápio.')
where id = 1;
