-- =============================================================
-- Horário aberto para a fase de demonstração.
--
-- Enquanto o dono avalia o sistema, a loja precisa aceitar pedido a
-- qualquer hora — senão quem abrir o link fora do almoço vê "fechado" e
-- não consegue testar nada.
--
-- ANTES DE DIVULGAR PARA O CLIENTE FINAL, o horário real precisa voltar.
-- Segundo o perfil oficial (@churrascariabrasaviva849), a casa serve
-- "churrasco na brasa seg a sab" — ou seja, DOMINGO FECHADO:
--
--   update public.horarios set fechado = true where dia_semana = 0;
--   update public.horarios set fechado = false, abre = '11:00', fecha = '16:00'
--    where dia_semana between 1 and 6;
--
-- Isso também se faz pelo painel, em Configurações > Horário de
-- funcionamento, sem precisar de SQL.
-- Rodar depois de 0001..0012.
-- =============================================================

update public.horarios set fechado = false, abre = '00:00', fecha = '23:59';
update public.configuracoes set aberto_manual = true where id = 1;
