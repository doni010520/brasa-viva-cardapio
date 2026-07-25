-- =============================================================
-- Campanha pós-pagamento ("poste e ganhe um bombom").
--
-- Depois que o pagamento é aprovado, o cliente cai numa tela de
-- agradecimento com a chamada da campanha. O botão leva ao Instagram
-- do restaurante. Tudo editável pelo dono, e desligável.
-- Rodar depois de 0001..0005.
-- =============================================================

alter table public.configuracoes
  add column if not exists instagram_url      text,
  add column if not exists campanha_ativa     boolean not null default false,
  add column if not exists campanha_titulo    text,
  add column if not exists campanha_texto     text,
  add column if not exists campanha_botao     text,
  add column if not exists campanha_emoji     text;

-- Texto inicial, já preenchido para o dono ver funcionando e ajustar depois
update public.configuracoes set
  campanha_titulo = coalesce(campanha_titulo, 'Poste e ganhe um bombom!'),
  campanha_texto  = coalesce(
    campanha_texto,
    'Marque a gente numa foto ou story do seu pedido, siga nosso perfil e retire seu bombom no caixa na próxima visita.'
  ),
  campanha_botao  = coalesce(campanha_botao, 'Quero meu bombom'),
  campanha_emoji  = coalesce(campanha_emoji, '🍫')
where id = 1;
