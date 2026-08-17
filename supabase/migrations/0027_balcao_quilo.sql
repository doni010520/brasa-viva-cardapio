-- =============================================================
-- Lançamento pelo balcão: a refeição no quilo entra no sistema.
--
-- Até aqui todo pedido nascia do cliente no site, e o quilo ficava de
-- fora de propósito ("pesa no balcão, não há o que pedir"). O dono quer
-- o contrário: o quilo virar número no relatório, no recibo e na comanda.
-- A atendente digita o valor da balança (e itens do cardápio, se houver)
-- numa tela interna, e o pedido nasce já pago.
--
-- 'interno' é o modo de consumo que NÃO aparece em cardápio nenhum: só a
-- atendente enxerga, só ela lança.
-- Rodar depois de 0001..0026.
-- =============================================================

alter table public.produtos drop constraint if exists produtos_modo_consumo_check;
alter table public.produtos
  add constraint produtos_modo_consumo_check
  check (modo_consumo in ('ambos', 'so_local', 'so_viagem', 'interno'));

-- de onde o pedido veio: 'site' (cliente) ou 'balcao' (atendente)
alter table public.pedidos
  add column if not exists origem text not null default 'site'
    check (origem in ('site', 'balcao'));

-- Produto interno do quilo. Preço 0 porque o valor real é digitado na hora;
-- o preço do item no pedido é o que vale (snapshot), não o do catálogo.
do $$
declare
  cat uuid;
begin
  select id into cat from public.categorias where lower(nome) = 'balcão' limit 1;
  if cat is null then
    insert into public.categorias (nome, descricao, ordem, ativo)
      values ('Balcão', 'Lançamentos internos da atendente', 999, true)
      returning id into cat;
  end if;

  if not exists (
    select 1 from public.produtos where categoria_id = cat and nome = 'Refeição no quilo'
  ) then
    insert into public.produtos
      (categoria_id, nome, descricao, preco_centavos, disponivel, destaque, ordem, modo_consumo)
    values
      (cat, 'Refeição no quilo', 'Valor da balança, digitado no balcão', 0, true, false, 1, 'interno');
  end if;
end $$;
