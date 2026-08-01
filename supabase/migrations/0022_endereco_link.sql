-- =============================================================
-- O endereço do rodapé vira um atalho para o mapa.
--
-- O dono cola o link do Google Maps da casa em Configurações e o
-- rodapé da loja passa a abrir o mapa num toque — no celular isso
-- cai direto no app de navegação. Sem o link, o endereço continua
-- como texto puro, igual era.
-- Rodar depois de 0001..0021.
-- =============================================================

alter table public.configuracoes
  add column if not exists endereco_url text;
