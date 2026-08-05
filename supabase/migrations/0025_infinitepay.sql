-- =============================================================
-- InfinitePay entra como meio de pagamento online.
--
-- O checkout deles é por redirect: criamos um link, o cliente paga na
-- página da InfinitePay (Pix taxa zero ou cartão) e volta. O pedido
-- guarda o link (para o botão "Pagar agora" de quem abandonou no meio)
-- e o rastro da transação que o webhook confirmar.
-- Rodar depois de 0001..0024.
-- =============================================================

alter table public.pedidos
  add column if not exists ip_link_url        text,
  add column if not exists ip_slug            text,
  add column if not exists ip_transaction_nsu text,
  add column if not exists ip_receipt_url     text;
