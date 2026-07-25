-- =============================================================
-- Modo de consumo e reestruturação do cardápio da Brasa Viva.
--
-- A casa vende de três jeitos:
--   1. buffet livre  -> come no local, serve-se uma vez
--   2. no quilo      -> pesa no balcão (NÃO passa por este sistema:
--                        não existe pedido a fazer, a pessoa se serve)
--   3. marmitas      -> prato pronto, para retirar ou receber em casa
--
-- Por isso o cliente escolhe primeiro ONDE vai comer. O buffet só aparece
-- para quem está no restaurante; marmita serve para os três casos.
-- Rodar depois de 0001..0004.
-- =============================================================

-- ------------------------------------------------- modo de consumo
-- 'local' entra junto com 'retirada' e 'entrega'
alter table public.pedidos drop constraint if exists pedidos_tipo_entrega_check;
alter table public.pedidos
  add constraint pedidos_tipo_entrega_check
  check (tipo_entrega in ('local', 'retirada', 'entrega'));

-- Endereço continua obrigatório só na entrega
alter table public.pedidos drop constraint if exists pedidos_endereco_na_entrega_check;
alter table public.pedidos
  add constraint pedidos_endereco_na_entrega_check
  check (
    tipo_entrega <> 'entrega'
    or (endereco_rua is not null and endereco_numero is not null and endereco_bairro is not null)
  );

-- Onde cada produto pode ser vendido.
--   'ambos'     -> aparece sempre (padrão)
--   'so_local'  -> só para quem está no restaurante (buffet livre)
--   'so_viagem' -> só para retirada/entrega (ex.: marmita embalada)
alter table public.produtos
  add column if not exists modo_consumo text not null default 'ambos';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_modo_consumo_check') then
    alter table public.produtos
      add constraint produtos_modo_consumo_check
      check (modo_consumo in ('ambos', 'so_local', 'so_viagem'));
  end if;
end $$;

-- A loja pode desligar o atendimento no salão
alter table public.configuracoes
  add column if not exists aceita_consumo_local boolean not null default true;

-- =============================================================
-- Reestruturação do cardápio de exemplo
-- =============================================================
do $$
declare
  cat_buffet   uuid;
  cat_marmitas uuid;
  prod  uuid;
  grupo uuid;
begin
  -- ---------- 1. a casa não vende espeto ----------
  delete from public.categorias where lower(nome) = 'espetos';

  -- ---------- 2. "Pratos" vira "Marmitas" ----------
  update public.categorias
     set nome = 'Marmitas',
         descricao = 'Prato pronto, embalado na hora'
   where lower(nome) = 'pratos';

  select id into cat_marmitas from public.categorias where nome = 'Marmitas' limit 1;

  if cat_marmitas is not null then
    -- "Marmita executiva" com esse nome dentro de "Marmitas" fica redundante
    update public.produtos
       set nome = 'Marmita do dia',
           descricao = 'Carne do dia, arroz, feijão, farofa e salada. Sai rápido, feita na hora.'
     where categoria_id = cat_marmitas and nome = 'Marmita executiva';

    -- estes saem embalados; não fazem sentido para quem está sentado no salão
    update public.produtos
       set modo_consumo = 'so_viagem'
     where categoria_id = cat_marmitas;
  end if;

  -- ---------- 3. Buffet livre, só para quem está no restaurante ----------
  if not exists (select 1 from public.categorias where lower(nome) = 'buffet') then
    insert into public.categorias (nome, descricao, ordem)
      values ('Buffet', 'Serviço no salão. Pague por aqui e sirva-se.', 0)
      returning id into cat_buffet;

    insert into public.produtos
      (categoria_id, nome, descricao, preco_centavos, destaque, ordem, modo_consumo)
    values
      (cat_buffet, 'Buffet livre',
       'Serve-se uma vez, à vontade no prato. Carnes, guarnições e saladas.',
       5490, true, 1, 'so_local')
    returning id into prod;

    insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
      values (prod, 'Bebida inclusa?', 0, 1, 1) returning id into grupo;
    insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
      (grupo, 'Sem bebida',              0, 1),
      (grupo, 'Com refrigerante lata',  600, 2),
      (grupo, 'Com suco natural',       900, 3);

    insert into public.produtos
      (categoria_id, nome, descricao, preco_centavos, ordem, modo_consumo)
    values
      (cat_buffet, 'Buffet livre infantil',
       'Para crianças de 5 a 10 anos. Até 4 anos não paga.',
       2990, 2, 'so_local');
  end if;

  -- ---------- 4. reordena o que sobrou ----------
  update public.categorias set ordem = 0 where nome = 'Buffet';
  update public.categorias set ordem = 1 where nome = 'Marmitas';
  update public.categorias set ordem = 2 where nome = 'Porções';
  update public.categorias set ordem = 3 where nome = 'Acompanhamentos';
  update public.categorias set ordem = 4 where nome = 'Bebidas';
  update public.categorias set ordem = 5 where nome = 'Sobremesas';
end $$;
