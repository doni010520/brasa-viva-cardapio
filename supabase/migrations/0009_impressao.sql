-- =============================================================
-- Fila de impressão de comandas.
--
-- O app roda na nuvem e a impressora está dentro do restaurante: não há
-- como o servidor falar com ela direto. Então o servidor só ENFILEIRA a
-- comanda, e um agente rodando num PC do salão puxa a fila e imprime.
--
-- A fila também serve de histórico: dá para ver o que imprimiu, o que
-- falhou e reimprimir sem inventar o pedido de novo.
-- Rodar depois de 0001..0008.
-- =============================================================

create table if not exists public.impressoes (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  status      text not null default 'pendente'
                   check (status in ('pendente', 'impresso', 'erro')),
  -- 'cozinha' hoje; abre espaço para via do caixa/bar depois
  via         text not null default 'cozinha',
  tentativas  int  not null default 0,
  erro        text,
  criado_em   timestamptz not null default now(),
  impresso_em timestamptz
);

-- O agente busca por aqui: só o que está pendente, mais antigo primeiro.
create index if not exists impressoes_pendentes_idx
  on public.impressoes (criado_em)
  where status = 'pendente';

create index if not exists impressoes_pedido_idx on public.impressoes (pedido_id, criado_em desc);

-- ------------------------------------------------- configuração
alter table public.configuracoes
  add column if not exists impressao_automatica boolean not null default true,
  -- quantas vias da cozinha saem por pedido
  add column if not exists vias_cozinha int not null default 1
    check (vias_cozinha between 1 and 3);

-- -------------------------------------------------------------
-- Enfileira sozinho quando o pedido entra na cozinha.
--
-- O gatilho é a fonte única: não importa se o pedido veio do caixa, do
-- QR da mesa ou da confirmação do pagamento pelo webhook — todos passam
-- por aqui, e nenhum pedido deixa de ser impresso porque alguém esqueceu
-- de chamar a função em algum caminho do código.
-- -------------------------------------------------------------
create or replace function public.enfileira_impressao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vias int;
  liga boolean;
  i    int;
begin
  -- só quando ACABOU de entrar em 'recebido'
  if new.status <> 'recebido' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'recebido' then
    return null;
  end if;

  select impressao_automatica, vias_cozinha into liga, vias
    from public.configuracoes where id = 1;

  if not coalesce(liga, true) then
    return null;
  end if;

  -- não duplica se já existir comanda para este pedido
  if exists (select 1 from public.impressoes where pedido_id = new.id and via = 'cozinha') then
    return null;
  end if;

  for i in 1..coalesce(vias, 1) loop
    insert into public.impressoes (pedido_id, via) values (new.id, 'cozinha');
  end loop;

  return null;
end;
$$;

drop trigger if exists pedidos_enfileira_impressao on public.pedidos;
create trigger pedidos_enfileira_impressao
  after insert or update of status on public.pedidos
  for each row execute function public.enfileira_impressao();

-- ------------------------------------------------------------- RLS
-- A fila só é lida pelo agente, e ele usa a chave de serviço.
alter table public.impressoes enable row level security;

drop policy if exists "admin le impressoes" on public.impressoes;
create policy "admin le impressoes" on public.impressoes
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
