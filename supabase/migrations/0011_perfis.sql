-- =============================================================
-- Perfis de acesso ao painel.
--
--   dono      -> tudo: preços, relatórios, clientes, configurações, equipe
--   atendente -> só a tela de pedidos e o botão de esgotar item
--
-- O atendente não vê faturamento nem consegue mexer em preço. É o mínimo
-- para deixar um funcionário operar o balcão sem acesso ao caixa da casa.
-- Rodar depois de 0001..0010.
-- =============================================================

alter table public.admins
  add column if not exists papel text not null default 'atendente',
  add column if not exists ativo boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_papel_check') then
    alter table public.admins
      add constraint admins_papel_check check (papel in ('dono', 'atendente'));
  end if;
end $$;

-- Quem já usava o sistema antes desta migração é dono: eram os únicos que
-- existiam, e rebaixá-los trancaria o dono para fora da própria casa.
update public.admins set papel = 'dono' where papel is null or papel = 'atendente';

-- -------------------------------------------------------------
-- Novo usuário do Auth entra como atendente...
-- ...exceto o primeiro de todos, que vira dono. Isso evita o caso de
-- ficar sem ninguém capaz de administrar caso o cadastro seja feito
-- direto pelo Supabase.
-- -------------------------------------------------------------
create or replace function public.handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  papel_novo text;
begin
  select case when count(*) = 0 then 'dono' else 'atendente' end
    into papel_novo
    from public.admins;

  insert into public.admins (user_id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce(new.raw_user_meta_data->>'papel', papel_novo)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- -------------------------------------------------------------
-- Trava no banco: sempre tem de sobrar pelo menos um dono ativo.
-- Sem isto, um clique errado deixa o restaurante sem administrador.
-- -------------------------------------------------------------
create or replace function public.protege_ultimo_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  donos_restantes int;
begin
  if tg_op = 'DELETE' then
    if old.papel <> 'dono' then return old; end if;
  else
    if old.papel = 'dono' and new.papel = 'dono' and new.ativo then return new; end if;
    if old.papel <> 'dono' then return new; end if;
  end if;

  select count(*) into donos_restantes
    from public.admins
   where papel = 'dono' and ativo
     and user_id <> old.user_id;

  if donos_restantes = 0 then
    raise exception 'Este é o último dono do sistema. Promova outra pessoa antes de remover ou rebaixar esta.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists admins_protege_ultimo_dono on public.admins;
create trigger admins_protege_ultimo_dono
  before update or delete on public.admins
  for each row execute function public.protege_ultimo_dono();
