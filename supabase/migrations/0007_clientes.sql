-- =============================================================
-- Cadastro de clientes que se monta sozinho.
--
-- Ninguém cria conta nem senha: o telefone é a identidade. A cada pedido,
-- o cliente é criado ou atualizado e os totais são recalculados. Assim o
-- dono sabe quem comprou, o que comprou, quando, quanto gastou e há quanto
-- tempo sumiu — sem nunca ter posto uma tela de cadastro na frente da venda.
-- Rodar depois de 0001..0006.
-- =============================================================

create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  -- só dígitos, com DDD. É a chave natural da pessoa.
  telefone              text not null unique,
  nome                  text not null,
  email                 text,
  data_nascimento       date,
  -- o dono anota o que quiser: "gosta da picanha mal passada"
  observacoes           text,
  aceita_promocoes      boolean not null default true,
  -- agregados, recalculados por gatilho
  primeiro_pedido_em    timestamptz,
  ultimo_pedido_em      timestamptz,
  total_pedidos         int not null default 0,
  total_gasto_centavos  int not null default 0,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists clientes_ultimo_pedido_idx on public.clientes (ultimo_pedido_em desc);
create index if not exists clientes_total_gasto_idx   on public.clientes (total_gasto_centavos desc);
-- aniversariantes do mês, sem varrer a tabela inteira
create index if not exists clientes_aniversario_idx
  on public.clientes (extract(month from data_nascimento), extract(day from data_nascimento));

alter table public.pedidos
  add column if not exists cliente_id      uuid references public.clientes(id) on delete set null,
  add column if not exists cliente_nascimento date;

create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id, criado_em desc);

drop trigger if exists clientes_atualizado_em on public.clientes;
create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function public.toca_atualizado_em();

-- -------------------------------------------------------------
-- 1) Antes de gravar o pedido: acha ou cria o cliente pelo telefone
-- -------------------------------------------------------------
create or replace function public.vincula_cliente_ao_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  digitos text;
  achado  uuid;
begin
  digitos := regexp_replace(coalesce(new.cliente_telefone, ''), '\D', '', 'g');
  if length(digitos) < 10 then
    return new;  -- telefone inválido: segue sem vincular
  end if;

  select id into achado from public.clientes where telefone = digitos;

  if achado is null then
    insert into public.clientes (telefone, nome, email, data_nascimento)
    values (digitos, new.cliente_nome, new.cliente_email, new.cliente_nascimento)
    returning id into achado;
  else
    -- dados mais recentes ganham, mas nunca apagam o que já existe
    update public.clientes set
      nome            = coalesce(nullif(new.cliente_nome, ''), nome),
      email           = coalesce(nullif(new.cliente_email, ''), email),
      data_nascimento = coalesce(new.cliente_nascimento, data_nascimento)
    where id = achado;
  end if;

  new.cliente_id := achado;
  return new;
end;
$$;

drop trigger if exists pedidos_vincula_cliente on public.pedidos;
create trigger pedidos_vincula_cliente
  before insert or update of cliente_telefone on public.pedidos
  for each row execute function public.vincula_cliente_ao_pedido();

-- -------------------------------------------------------------
-- 2) Depois de gravar: recalcula os totais daquele cliente
--
-- Recalcula em vez de somar de propósito: assim um pedido cancelado ou
-- estornado corrige o histórico sozinho, sem número torto acumulado.
-- -------------------------------------------------------------
create or replace function public.recalcula_totais_do_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid;
begin
  alvo := coalesce(new.cliente_id, old.cliente_id);
  if alvo is null then
    return null;
  end if;

  update public.clientes c set
    total_pedidos        = t.qtd,
    total_gasto_centavos = t.valor,
    primeiro_pedido_em   = t.primeiro,
    ultimo_pedido_em     = t.ultimo
  from (
    select
      count(*)::int                      as qtd,
      coalesce(sum(total_centavos), 0)::int as valor,
      min(criado_em)                     as primeiro,
      max(criado_em)                     as ultimo
    from public.pedidos
    where cliente_id = alvo
      and status not in ('cancelado', 'aguardando_pagamento')
  ) t
  where c.id = alvo;

  return null;
end;
$$;

drop trigger if exists pedidos_recalcula_cliente on public.pedidos;
create trigger pedidos_recalcula_cliente
  after insert or update or delete on public.pedidos
  for each row execute function public.recalcula_totais_do_cliente();

-- -------------------------------------------------------------
-- 3) Preenche o cadastro com quem já pediu antes desta migração
-- -------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select id, cliente_telefone from public.pedidos where cliente_id is null
  loop
    -- o UPDATE dispara os dois gatilhos e resolve tudo
    update public.pedidos set cliente_telefone = cliente_telefone where id = p.id;
  end loop;
end $$;

-- ------------------------------------------------------------- RLS
-- Dado de cliente é o ativo mais sensível da casa: nada de leitura pública.
alter table public.clientes enable row level security;

drop policy if exists "admin le clientes" on public.clientes;
create policy "admin le clientes" on public.clientes
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- -------------------------------------------------------------
-- 4) Brinde de aniversário, para o dono usar na campanha
-- -------------------------------------------------------------
alter table public.configuracoes
  add column if not exists pedir_aniversario boolean not null default true,
  add column if not exists brinde_aniversario text;

update public.configuracoes
   set brinde_aniversario = coalesce(brinde_aniversario, 'uma sobremesa por nossa conta')
 where id = 1;
