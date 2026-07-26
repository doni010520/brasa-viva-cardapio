-- A tela de entrada passou a usar a foto como FUNDO da tela inteira, por baixo
-- de uma camada preta, em vez de uma faixa deitada no topo.
--
-- Para isso a imagem precisa ser em pé: uma faixa 960x460 esticada na altura
-- de um celular vira um borrão. O arquivo novo é a mesma montagem em retrato
-- (1080x1920), gerada por scripts/montar-capa.mjs.
--
-- Só troca quem ainda estava com a imagem padrão; se o dono já subiu foto
-- dele pelo painel, ela fica.

update public.configuracoes
set foto_fachada_url = '/fachada-fundo.webp'
where foto_fachada_url = '/fachada.webp'
   or foto_fachada_url is null;
