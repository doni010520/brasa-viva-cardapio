-- Volta o login do cliente, agora por decisão tomada com o problema na mão.
--
-- O que aconteceu: sem conta, o histórico do cliente vivia só no navegador
-- daquele aparelho. Trocou de celular, limpou os dados ou abriu por outro
-- navegador, e os pedidos sumiam. Não tem para onde fugir: para o cliente
-- levar o histórico com ele, precisa de alguma conta.
--
-- Menos burocrático que dá: o WhatsApp é o usuário, um código de 6 dígitos é
-- a senha. Ninguém escolhe senha, ninguém confirma e-mail, ninguém preenche
-- cadastro — a ficha do cliente já nasce sozinha a cada pedido (0007).
--
-- Por que não basta digitar o telefone: quem soubesse o número de alguém
-- veria o nome, o endereço de entrega e tudo que a pessoa já comprou. O
-- código prova que o telefone é de quem está digitando.
--
-- (Estas tabelas existiram na 0014 e foram derrubadas na 0016. Voltam sem a
-- coluna `tipo`: o link mágico não faz parte desta versão.)

create table if not exists public.codigos_acesso (
  id          uuid primary key default gen_random_uuid(),
  -- só dígitos, com DDD, igual a clientes.telefone
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

-- RLS ligada e SEM política nenhuma, de propósito: estas duas tabelas são o
-- cofre do login. Só o servidor (service role, que ignora RLS) encosta nelas.
-- Nenhum navegador, nem com a chave anon.
alter table public.codigos_acesso  enable row level security;
alter table public.sessoes_cliente enable row level security;

-- Código velho e sessão vencida não servem para nada e só aumentam a
-- superfície de ataque. Roda junto com o pedido de código novo, que é raro
-- o suficiente para não pesar.
create or replace function public.limpa_acessos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codigos_acesso  where expira_em < now() - interval '1 day';
  delete from public.sessoes_cliente where expira_em < now();
$$;
