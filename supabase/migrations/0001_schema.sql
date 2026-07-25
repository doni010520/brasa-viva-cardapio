-- =============================================================
-- Cardápio Online — schema inicial
-- Valores monetários sempre em CENTAVOS (integer). Nunca float.
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- Configurações da loja (linha única, id = 1)
-- -------------------------------------------------------------
create table if not exists public.configuracoes (
  id                      int primary key default 1 check (id = 1),
  nome                    text        not null default 'Meu Restaurante',
  descricao               text,
  logo_url                text,
  cor_primaria            text        not null default '#e11d48',
  telefone                text,
  whatsapp                text,
  endereco                text,
  -- operação
  aberto_manual           boolean     not null default true,   -- chave geral do dono
  tempo_preparo_min       int         not null default 30,
  antecedencia_min        int         not null default 15,     -- menor horário de retirada ofertado
  pedido_minimo_centavos  int         not null default 0,
  -- pagamento
  aceita_pagamento_online boolean     not null default true,
  aceita_pagamento_local  boolean     not null default true,
  chave_pix               text,
  atualizado_em           timestamptz not null default now()
);

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Horários de funcionamento (0 = domingo ... 6 = sábado)
-- -------------------------------------------------------------
create table if not exists public.horarios (
  dia_semana  int primary key check (dia_semana between 0 and 6),
  fechado     boolean not null default false,
  abre        time    not null default '11:00',
  fecha       time    not null default '23:00'
);

insert into public.horarios (dia_semana, fechado)
select g, g = 1 from generate_series(0, 6) g
on conflict (dia_semana) do nothing;

-- -------------------------------------------------------------
-- Cardápio
-- -------------------------------------------------------------
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nome        text    not null,
  descricao   text,
  ordem       int     not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists public.produtos (
  id                       uuid primary key default gen_random_uuid(),
  categoria_id             uuid references public.categorias(id) on delete set null,
  nome                     text    not null,
  descricao                text,
  preco_centavos           int     not null check (preco_centavos >= 0),
  preco_promo_centavos     int              check (preco_promo_centavos >= 0),
  imagem_url               text,
  disponivel               boolean not null default true,   -- "esgotou hoje"
  destaque                 boolean not null default false,
  ordem                    int     not null default 0,
  criado_em                timestamptz not null default now()
);

create index if not exists produtos_categoria_idx on public.produtos (categoria_id, ordem);

-- Grupos de opções: "Escolha o tamanho", "Adicionais", "Ponto da carne"
create table if not exists public.grupos_opcoes (
  id           uuid primary key default gen_random_uuid(),
  produto_id   uuid not null references public.produtos(id) on delete cascade,
  nome         text not null,
  min_escolhas int  not null default 0 check (min_escolhas >= 0),
  max_escolhas int  not null default 1 check (max_escolhas >= 1),
  ordem        int  not null default 0,
  constraint grupos_min_menor_que_max check (min_escolhas <= max_escolhas)
);

create index if not exists grupos_opcoes_produto_idx on public.grupos_opcoes (produto_id, ordem);

create table if not exists public.opcoes (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid not null references public.grupos_opcoes(id) on delete cascade,
  nome                  text not null,
  preco_extra_centavos  int  not null default 0 check (preco_extra_centavos >= 0),
  disponivel            boolean not null default true,
  ordem                 int  not null default 0
);

create index if not exists opcoes_grupo_idx on public.opcoes (grupo_id, ordem);

-- -------------------------------------------------------------
-- Cupons de desconto
-- -------------------------------------------------------------
create table if not exists public.cupons (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique,
  tipo                  text not null check (tipo in ('percentual', 'fixo')),
  valor                 int  not null check (valor > 0),  -- % (1-100) ou centavos
  minimo_centavos       int  not null default 0,
  ativo                 boolean not null default true,
  validade              date,
  usos_maximos          int,
  usos                  int  not null default 0,
  criado_em             timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Pedidos
-- -------------------------------------------------------------
create sequence if not exists public.pedido_numero_seq start 1;

create table if not exists public.pedidos (
  id                    uuid primary key default gen_random_uuid(),
  numero                int  not null default nextval('public.pedido_numero_seq'),
  cliente_nome          text not null,
  cliente_telefone      text not null,
  observacoes           text,
  -- valores
  subtotal_centavos     int  not null default 0,
  desconto_centavos     int  not null default 0,
  total_centavos        int  not null default 0,
  cupom_codigo          text,
  -- fluxo
  forma_pagamento       text not null check (forma_pagamento in ('online', 'local')),
  status_pagamento      text not null default 'pendente'
                             check (status_pagamento in ('pendente', 'pago', 'falhou', 'estornado')),
  status                text not null default 'aguardando_pagamento'
                             check (status in ('aguardando_pagamento', 'recebido', 'em_preparo',
                                               'pronto', 'retirado', 'cancelado')),
  retirada_prevista     timestamptz,
  -- mercado pago
  mp_preference_id      text,
  mp_payment_id         text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists pedidos_status_idx on public.pedidos (status, criado_em desc);
create index if not exists pedidos_criado_idx on public.pedidos (criado_em desc);
create unique index if not exists pedidos_mp_payment_idx
  on public.pedidos (mp_payment_id) where mp_payment_id is not null;

create table if not exists public.pedido_itens (
  id                    uuid primary key default gen_random_uuid(),
  pedido_id             uuid not null references public.pedidos(id) on delete cascade,
  produto_id            uuid references public.produtos(id) on delete set null,
  produto_nome          text not null,          -- snapshot: o cardápio pode mudar depois
  quantidade            int  not null check (quantidade > 0),
  preco_unit_centavos   int  not null,          -- já inclui as opções escolhidas
  opcoes                jsonb not null default '[]'::jsonb,
  observacao            text,
  total_centavos        int  not null
);

create index if not exists pedido_itens_pedido_idx on public.pedido_itens (pedido_id);

-- Trilha de status, para o dono saber quem mudou o quê e quando
create table if not exists public.pedido_eventos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  de          text,
  para        text not null,
  origem      text not null default 'sistema',  -- 'admin' | 'sistema' | 'webhook'
  criado_em   timestamptz not null default now()
);

create index if not exists pedido_eventos_pedido_idx on public.pedido_eventos (pedido_id, criado_em);

-- -------------------------------------------------------------
-- Administradores (quem pode entrar no painel)
-- -------------------------------------------------------------
create table if not exists public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text,
  email     text,
  criado_em timestamptz not null default now()
);

-- Todo usuário criado no Auth vira admin automaticamente.
-- O acesso é controlado por quem consegue criar usuário (só o dono, via Supabase).
create or replace function public.handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admins (user_id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_novo_usuario();

-- -------------------------------------------------------------
-- atualizado_em automático
-- -------------------------------------------------------------
create or replace function public.toca_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists pedidos_atualizado_em on public.pedidos;
create trigger pedidos_atualizado_em before update on public.pedidos
  for each row execute function public.toca_atualizado_em();

drop trigger if exists config_atualizado_em on public.configuracoes;
create trigger config_atualizado_em before update on public.configuracoes
  for each row execute function public.toca_atualizado_em();

-- =============================================================
-- RLS
-- Regra geral: o cliente anônimo só LÊ o cardápio.
-- Escrita de pedidos e todo o admin passam pelo servidor (service role),
-- que ignora RLS. Nada sensível fica exposto pela anon key.
-- =============================================================
alter table public.configuracoes  enable row level security;
alter table public.horarios       enable row level security;
alter table public.categorias     enable row level security;
alter table public.produtos       enable row level security;
alter table public.grupos_opcoes  enable row level security;
alter table public.opcoes         enable row level security;
alter table public.cupons         enable row level security;
alter table public.pedidos        enable row level security;
alter table public.pedido_itens   enable row level security;
alter table public.pedido_eventos enable row level security;
alter table public.admins         enable row level security;

-- Leitura pública do cardápio
drop policy if exists "cardapio publico: configuracoes" on public.configuracoes;
create policy "cardapio publico: configuracoes" on public.configuracoes
  for select to anon, authenticated using (true);

drop policy if exists "cardapio publico: horarios" on public.horarios;
create policy "cardapio publico: horarios" on public.horarios
  for select to anon, authenticated using (true);

drop policy if exists "cardapio publico: categorias" on public.categorias;
create policy "cardapio publico: categorias" on public.categorias
  for select to anon, authenticated using (ativo = true);

drop policy if exists "cardapio publico: produtos" on public.produtos;
create policy "cardapio publico: produtos" on public.produtos
  for select to anon, authenticated using (true);

drop policy if exists "cardapio publico: grupos" on public.grupos_opcoes;
create policy "cardapio publico: grupos" on public.grupos_opcoes
  for select to anon, authenticated using (true);

drop policy if exists "cardapio publico: opcoes" on public.opcoes;
create policy "cardapio publico: opcoes" on public.opcoes
  for select to anon, authenticated using (true);

-- Admin autenticado enxerga tudo pelo cliente do navegador (leitura).
-- As escritas continuam indo por server actions com service role.
drop policy if exists "admin le pedidos" on public.pedidos;
create policy "admin le pedidos" on public.pedidos
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "admin le itens" on public.pedido_itens;
create policy "admin le itens" on public.pedido_itens
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "admin le cupons" on public.cupons;
create policy "admin le cupons" on public.cupons
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "admin le a si mesmo" on public.admins;
create policy "admin le a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- -------------------------------------------------------------
-- Storage: bucket público para as fotos dos pratos
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cardapio', 'cardapio', true)
on conflict (id) do nothing;

drop policy if exists "fotos do cardapio sao publicas" on storage.objects;
create policy "fotos do cardapio sao publicas" on storage.objects
  for select to anon, authenticated using (bucket_id = 'cardapio');
