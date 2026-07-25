-- =============================================================
-- Entrega (delivery) por bairro, além da retirada no balcão.
-- Rodar depois de 0001 e 0002.
-- =============================================================

-- ---------------------------------------------- configurações da operação
alter table public.configuracoes
  add column if not exists aceita_retirada     boolean not null default true,
  add column if not exists aceita_entrega      boolean not null default false,
  add column if not exists tempo_entrega_min   int     not null default 45,
  add column if not exists entrega_gratis_acima_centavos int;  -- null = nunca isenta

-- --------------------------------------------------- bairros atendidos
create table if not exists public.bairros_entrega (
  id            uuid primary key default gen_random_uuid(),
  nome          text    not null,
  taxa_centavos int     not null default 0 check (taxa_centavos >= 0),
  tempo_min     int     not null default 45 check (tempo_min >= 0),
  ativo         boolean not null default true,
  ordem         int     not null default 0,
  criado_em     timestamptz not null default now()
);

create unique index if not exists bairros_entrega_nome_idx
  on public.bairros_entrega (lower(nome));

-- --------------------------------------------------------- pedidos
alter table public.pedidos
  add column if not exists tipo_entrega          text not null default 'retirada',
  add column if not exists entrega_taxa_centavos int  not null default 0,
  add column if not exists bairro_id             uuid references public.bairros_entrega(id) on delete set null,
  add column if not exists endereco_rua          text,
  add column if not exists endereco_numero       text,
  add column if not exists endereco_complemento  text,
  add column if not exists endereco_bairro       text,
  add column if not exists endereco_referencia   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_tipo_entrega_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_tipo_entrega_check
      check (tipo_entrega in ('retirada', 'entrega'));
  end if;
end $$;

-- Pedido de entrega precisa de endereço. Retirada, não.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_endereco_na_entrega_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_endereco_na_entrega_check
      check (
        tipo_entrega = 'retirada'
        or (endereco_rua is not null and endereco_numero is not null and endereco_bairro is not null)
      );
  end if;
end $$;

-- Novo status: o entregador saiu com o pedido.
-- 'retirado' segue sendo o estado final dos dois fluxos (na entrega, lê-se "entregue").
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos
  add constraint pedidos_status_check
  check (status in ('aguardando_pagamento', 'recebido', 'em_preparo', 'pronto',
                    'saiu_para_entrega', 'retirado', 'cancelado'));

-- ------------------------------------------------------------- RLS
alter table public.bairros_entrega enable row level security;

drop policy if exists "bairros sao publicos" on public.bairros_entrega;
create policy "bairros sao publicos" on public.bairros_entrega
  for select to anon, authenticated using (ativo = true);

-- --------------------------------------------------- bairros de exemplo
insert into public.bairros_entrega (nome, taxa_centavos, tempo_min, ordem)
select * from (values
  ('Centro',        500,  40, 1),
  ('Boa Viagem',    700,  50, 2),
  ('Ribeira',       800,  55, 3),
  ('Bonfim',        900,  60, 4)
) as novos(nome, taxa_centavos, tempo_min, ordem)
where not exists (select 1 from public.bairros_entrega);
