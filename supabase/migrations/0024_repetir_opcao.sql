-- =============================================================
-- Repetir a mesma opção: "3x Fraldinha" no adicional.
--
-- Nos grupos de adicional o cliente não quer só marcar a carne — quer
-- dizer quantas. O grupo ganha a chave permite_repetir: com ela ligada,
-- a mesma opção pode entrar várias vezes e o MÁXIMO do grupo passa a
-- contar as repetições (até 6 = seis carnes, repetidas ou não).
--
-- Nasce desligada: grupo comum continua um-toque-uma-escolha.
-- Rodar depois de 0001..0023.
-- =============================================================

alter table public.grupos_opcoes
  add column if not exists permite_repetir boolean not null default false;
