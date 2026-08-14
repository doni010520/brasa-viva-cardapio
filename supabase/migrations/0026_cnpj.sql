-- =============================================================
-- CNPJ no cupom.
--
-- A comanda impressa passa a levar o CNPJ da casa e o aviso de
-- CUPOM NÃO FISCAL — pedido do dono, e também o que a boa prática
-- manda: cupom de térmica sem valor fiscal precisa dizer que não é.
-- Rodar depois de 0001..0025.
-- =============================================================

alter table public.configuracoes
  add column if not exists cnpj text;
