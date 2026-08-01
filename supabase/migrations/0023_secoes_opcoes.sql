-- =============================================================
-- Seções de grupos: um limite que vale para o CONJUNTO.
--
-- O caso que pediu isso: o Marmitex tem 4 tipos de churrasco (bovino,
-- frango, toscana, suíno), cada um "escolhe até 1". Soltos, o cliente
-- podia levar os 4 — ou nenhum. A casa quer: pelo menos 1, no máximo 2,
-- contando TODOS os tipos juntos.
--
-- A seção é esse pai: grupos apontam para ela (secao_id) e o total de
-- escolhas da seção respeita min/max dela, além das regras de cada
-- grupo. Grupo sem seção segue funcionando exatamente como antes.
-- Rodar depois de 0001..0022.
-- =============================================================

create table if not exists public.secoes_opcoes (
  id           uuid primary key default gen_random_uuid(),
  produto_id   uuid not null references public.produtos(id) on delete cascade,
  nome         text not null,
  -- total de escolhas somando todos os grupos da seção
  min_escolhas int  not null default 0 check (min_escolhas between 0 and 20),
  max_escolhas int  not null default 1 check (max_escolhas between 1 and 20),
  criado_em    timestamptz not null default now()
);

create index if not exists secoes_opcoes_produto_idx
  on public.secoes_opcoes (produto_id);

alter table public.grupos_opcoes
  add column if not exists secao_id uuid references public.secoes_opcoes(id) on delete set null;

-- ------------------------------------------------------------- RLS
-- Mesmo regime do resto do cardápio: leitura pública, escrita só pela
-- service role (as server actions do painel).
alter table public.secoes_opcoes enable row level security;

drop policy if exists "cardapio publico: secoes" on public.secoes_opcoes;
create policy "cardapio publico: secoes" on public.secoes_opcoes
  for select to anon, authenticated using (true);
