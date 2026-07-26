-- =============================================================
-- Foto da fachada + dados reais da Churrascaria Brasa Viva.
--
-- Os dados vieram do perfil oficial no Instagram
-- (@churrascariabrasaviva849). Até aqui o sistema rodava com endereço e
-- horário de exemplo.
-- Rodar depois de 0001..0011.
-- =============================================================

-- A fachada fica configurável: o dono troca a foto pelo painel quando
-- reformar a frente da loja, sem precisar de desenvolvedor.
alter table public.configuracoes
  add column if not exists foto_fachada_url text;

update public.configuracoes set
  nome              = 'Churrascaria Brasa Viva',
  descricao         = 'O Tradicional Churrasco Baiano. Almoço livre, no quilo e marmitex.',
  endereco          = 'Rua Padre Camilo Torrent, 557 — Cristo Rey, Dias d''Ávila/BA, 42850-000',
  instagram_url     = 'https://www.instagram.com/churrascariabrasaviva849',
  foto_fachada_url  = coalesce(foto_fachada_url, '/fachada.webp'),
  campanha_ativa    = true
where id = 1;

-- -------------------------------------------------------------
-- Horário: "Churrasco na brasa seg a sab" — domingo FECHADO.
--
-- O exemplo anterior tinha isto invertido (domingo aberto, segunda
-- fechada). Num restaurante, horário errado é pedido que entra quando
-- não tem ninguém na cozinha.
--
-- Os horários abaixo são os de um almoço típico. O dono ajusta no painel,
-- em Configurações, se a casa abrir em outro intervalo.
-- -------------------------------------------------------------
update public.horarios set fechado = true                        where dia_semana = 0;
update public.horarios set fechado = false, abre = '11:00', fecha = '16:00'
 where dia_semana between 1 and 6;
