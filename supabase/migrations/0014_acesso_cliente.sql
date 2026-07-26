-- Acesso do cliente ao próprio histórico, sem burocracia.
--
-- A conta dele é o WhatsApp; a senha é um código de 6 dígitos que chega no
-- WhatsApp e vale 10 minutos. Ninguém escolhe senha, ninguém esquece senha,
-- ninguém confirma e-mail. O cadastro já existe: a tabela `clientes` é
-- montada sozinha a cada pedido (migration 0007).
--
-- Por que precisa do código e não basta o telefone: quem soubesse o número
-- de alguém veria o nome, o endereço de entrega e tudo que a pessoa já comprou.
-- O código prova que o telefone é de quem está digitando.

-- ---------------------------------------------------------------- códigos
create table if not exists public.codigos_acesso (
  id          uuid primary key default gen_random_uuid(),
  -- só dígitos, com DDI+DDD, igual a clientes.telefone
  telefone    text not null,
  -- nunca guardamos o código em claro: se o banco vazar, ele não serve de nada
  codigo_hash text not null,
  expira_em   timestamptz not null,
  tentativas  int not null default 0,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);

create index if not exists codigos_acesso_busca_idx
  on public.codigos_acesso (telefone, criado_em desc);

-- ---------------------------------------------------------------- sessões
create table if not exists public.sessoes_cliente (
  id            uuid primary key default gen_random_uuid(),
  -- o token vive no cookie do navegador; aqui fica só o hash dele
  token_hash    text not null unique,
  cliente_id    uuid references public.clientes(id) on delete cascade,
  telefone      text not null,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now(),
  expira_em     timestamptz not null
);

create index if not exists sessoes_cliente_telefone_idx
  on public.sessoes_cliente (telefone);
create index if not exists sessoes_cliente_expira_idx
  on public.sessoes_cliente (expira_em);

-- RLS ligada e SEM política nenhuma: é assim que a gente quer.
-- Estas duas tabelas são o cofre do login — só o servidor (service role,
-- que ignora RLS) encosta nelas. Nenhum navegador, nem com a chave anon.
alter table public.codigos_acesso  enable row level security;
alter table public.sessoes_cliente enable row level security;

-- ---------------------------------------------------------------- faxina
-- Código velho e sessão vencida não servem para nada e só aumentam a
-- superfície de ataque. A limpeza roda junto com o pedido de código novo,
-- que é raro o suficiente para não pesar.
create or replace function public.limpa_acessos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codigos_acesso  where criado_em < now() - interval '1 day';
  delete from public.sessoes_cliente where expira_em < now();
$$;
