-- =============================================================
-- QR Code nas mesas.
--
-- Cada mesa tem um QR que abre o site já no modo "estou no restaurante"
-- e com a mesa preenchida. O cliente pede sentado, e a comanda sai na
-- cozinha dizendo de qual mesa veio.
-- Rodar depois de 0001..0007.
-- =============================================================

create table if not exists public.mesas (
  id         uuid primary key default gen_random_uuid(),
  -- o que está escrito na mesa: '12', 'Varanda 3', 'Balcão'
  numero     text not null,
  apelido    text,
  ativa      boolean not null default true,
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);

create unique index if not exists mesas_numero_idx on public.mesas (lower(numero));

alter table public.pedidos
  add column if not exists mesa_id     uuid references public.mesas(id) on delete set null,
  -- guardado como texto também: se a mesa for renomeada depois, o
  -- histórico continua dizendo de onde o pedido veio
  add column if not exists mesa_numero text;

create index if not exists pedidos_mesa_idx on public.pedidos (mesa_id, criado_em desc);

-- ------------------------------------------------------------- RLS
alter table public.mesas enable row level security;

-- O cliente precisa ler a mesa para validar o QR que escaneou
drop policy if exists "mesas ativas sao publicas" on public.mesas;
create policy "mesas ativas sao publicas" on public.mesas
  for select to anon, authenticated using (ativa = true);

-- ------------------------------------------------- mesas de exemplo
insert into public.mesas (numero, ordem)
select g::text, g from generate_series(1, 12) g
where not exists (select 1 from public.mesas);
